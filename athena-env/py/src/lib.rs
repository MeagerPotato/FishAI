//! `athena_env`: the Python batch API over ATHENA's us54 rules core (ATHENA.md §4.5 item 2).
//!
//! A thin binding of `athena_core::vecenv` (the core crate, `athena-env`, whose library is also named `athena_env`
//! and is renamed here). Every layout is the core's and is documented in `athena-env/API.md`. This crate adds only
//! the Python surface: argument checks, the NumPy buffers, and the GIL released around all of the Rust work.
//!
//! D12 (ATHENA.md §5): PyO3 and rust-numpy are the only dependencies, pinned by this crate's `Cargo.lock`. This crate
//! writes no `unsafe` code of its own (the lint below denies it; PyO3's generated glue is PyO3's).

#![deny(unsafe_code)]

use athena_core::cards::{NCARDS, NONE, NSEATS, NSETS, SET_CARDS, SET_NAMES};
use athena_core::codec::STEP_CAP;
use athena_core::rules::Action;
use athena_core::vecenv::{self as ve, ObsOut, StepOut, VecEnv};
use numpy::{
    PyArray1, PyArray2, PyArray3, PyArrayMethods, PyReadonlyArray2, PyReadwriteArray1, PyReadwriteArray2,
    PyReadwriteArray3, PyUntypedArrayMethods,
};
use pyo3::exceptions::{PyKeyError, PyTypeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyTuple};

fn value_error(e: String) -> PyErr {
    PyValueError::new_err(e)
}

/// A batch of `n` us54 games, stepped on `threads` threads with the GIL released.
///
/// See `athena-env/API.md` for the action codes, the legal row, the observation row, the event rows and the critic
/// buffer. The environment is not thread-safe from Python: one call at a time (a second concurrent call raises).
#[pyclass(module = "athena_env")]
struct BatchEnv {
    inner: VecEnv,
    /// Scratch for int64 actions converted to int32.
    actions32: Vec<i32>,
}

/// The five (or six) observation buffers of a dict, borrowed read-write.
struct Borrowed<'py> {
    seat: PyReadwriteArray1<'py, u8>,
    obs: PyReadwriteArray2<'py, u8>,
    legal: PyReadwriteArray2<'py, u8>,
    events: PyReadwriteArray3<'py, u8>,
    n_events: PyReadwriteArray1<'py, u8>,
    critic: Option<PyReadwriteArray2<'py, u8>>,
}

fn get_array<'py>(d: &Bound<'py, PyDict>, key: &str) -> PyResult<Bound<'py, PyAny>> {
    d.get_item(key)?
        .ok_or_else(|| PyKeyError::new_err(format!("observation buffers need the key {key:?}")))
}

fn rw1<'py>(a: &Bound<'py, PyAny>, key: &str, n: usize) -> PyResult<PyReadwriteArray1<'py, u8>> {
    let a = a
        .cast::<PyArray1<u8>>()
        .map_err(|_| PyTypeError::new_err(format!("{key} must be a 1-d uint8 array")))?;
    if a.shape() != [n] {
        return Err(PyValueError::new_err(format!(
            "{key} must have shape ({n},), not {:?}",
            a.shape()
        )));
    }
    a.try_readwrite()
        .map_err(|e| PyValueError::new_err(format!("{key} cannot be borrowed for writing: {e}")))
}

fn rw2<'py>(a: &Bound<'py, PyAny>, key: &str, n: usize, w: usize) -> PyResult<PyReadwriteArray2<'py, u8>> {
    let a = a
        .cast::<PyArray2<u8>>()
        .map_err(|_| PyTypeError::new_err(format!("{key} must be a 2-d uint8 array")))?;
    if a.shape() != [n, w] {
        return Err(PyValueError::new_err(format!(
            "{key} must have shape ({n}, {w}), not {:?}",
            a.shape()
        )));
    }
    a.try_readwrite()
        .map_err(|e| PyValueError::new_err(format!("{key} cannot be borrowed for writing: {e}")))
}

impl<'py> Borrowed<'py> {
    fn from_dict(d: &Bound<'py, PyDict>, n: usize) -> PyResult<Borrowed<'py>> {
        let events = get_array(d, "events")?;
        let events = events
            .cast::<PyArray3<u8>>()
            .map_err(|_| PyTypeError::new_err("events must be a 3-d uint8 array"))?;
        if events.shape() != [n, ve::MAX_EVENTS, ve::EVENT_LEN] {
            return Err(PyValueError::new_err(format!(
                "events must have shape ({n}, {}, {}), not {:?}",
                ve::MAX_EVENTS,
                ve::EVENT_LEN,
                events.shape()
            )));
        }
        let critic = match d.get_item("critic")? {
            Some(c) if !c.is_none() => Some(rw2(&c, "critic", n, ve::CRITIC_LEN)?),
            _ => None,
        };
        Ok(Borrowed {
            seat: rw1(&get_array(d, "seat")?, "seat", n)?,
            obs: rw2(&get_array(d, "obs")?, "obs", n, ve::OBS_LEN)?,
            legal: rw2(&get_array(d, "legal")?, "legal", n, ve::LEGAL_LEN)?,
            events: events
                .try_readwrite()
                .map_err(|e| PyValueError::new_err(format!("events cannot be borrowed for writing: {e}")))?,
            n_events: rw1(&get_array(d, "n_events")?, "n_events", n)?,
            critic,
        })
    }

    fn slices(&mut self) -> PyResult<ObsOut<'_>> {
        let contiguous = |_| PyValueError::new_err("observation buffers must be C-contiguous");
        Ok(ObsOut {
            seat: self.seat.as_slice_mut().map_err(contiguous)?,
            obs: self.obs.as_slice_mut().map_err(contiguous)?,
            legal: self.legal.as_slice_mut().map_err(contiguous)?,
            events: self.events.as_slice_mut().map_err(contiguous)?,
            n_events: self.n_events.as_slice_mut().map_err(contiguous)?,
            critic: match self.critic.as_mut() {
                Some(c) => Some(c.as_slice_mut().map_err(contiguous)?),
                None => None,
            },
        })
    }
}

#[pymethods]
impl BatchEnv {
    /// `BatchEnv(n, threads=1, auto_reset=None, auto_reset_start=0, track_digests=False)`.
    ///
    /// - `threads`: worker threads for every step and observation; the calling thread is one of them.
    /// - `auto_reset`: a seed prefix. A game that ends during `step` is replaced at once by game k, seed
    ///   `auto_reset + str(k)`, start seat `k % 6`, with k counting up from `auto_reset_start` in slot order.
    /// - `track_digests`: keep the replay format's digest streams so `digests()` can be compared with a corpus.
    #[new]
    #[pyo3(signature = (n, threads=1, auto_reset=None, auto_reset_start=0, track_digests=false))]
    fn new(
        n: usize,
        threads: usize,
        auto_reset: Option<String>,
        auto_reset_start: u64,
        track_digests: bool,
    ) -> PyResult<Self> {
        let mut inner = VecEnv::new(n, threads, track_digests).map_err(value_error)?;
        inner.set_auto_reset(auto_reset, auto_reset_start);
        Ok(BatchEnv {
            inner,
            actions32: Vec::new(),
        })
    }

    /// The number of games.
    #[getter]
    fn n(&self) -> usize {
        self.inner.len()
    }

    fn __len__(&self) -> usize {
        self.inner.len()
    }

    /// Worker threads (settable).
    #[getter]
    fn threads(&self) -> usize {
        self.inner.threads()
    }

    #[setter]
    fn set_threads(&mut self, threads: usize) -> PyResult<()> {
        self.inner.set_threads(threads).map_err(value_error)
    }

    /// Turn auto-reset on (a seed prefix) or off (None); the next game number is `start`.
    #[pyo3(signature = (prefix, start=0))]
    fn set_auto_reset(&mut self, prefix: Option<String>, start: u64) {
        self.inner.set_auto_reset(prefix, start);
    }

    /// The next auto-reset game number.
    #[getter]
    fn next_game(&self) -> u64 {
        self.inner.next_game()
    }

    /// Deal every game: `seeds[i]` (a str; the same string deals the same hands as the TypeScript reference) at
    /// `start_seats[i]` (0-5).
    fn reset(&mut self, py: Python<'_>, seeds: Vec<String>, start_seats: Vec<i64>) -> PyResult<()> {
        let starts = seats_u8(&start_seats)?;
        let inner = &mut self.inner;
        py.detach(move || inner.reset(&seeds, &starts)).map_err(value_error)
    }

    /// Start every game from a given deal: `holders` is a (n, 54) uint8 array of the seat holding each card.
    fn reset_deals(
        &mut self,
        py: Python<'_>,
        holders: PyReadonlyArray2<'_, u8>,
        start_seats: Vec<i64>,
    ) -> PyResult<()> {
        let n = self.inner.len();
        if holders.shape() != [n, NCARDS] {
            return Err(PyValueError::new_err(format!("holders must have shape ({n}, 54)")));
        }
        let h = holders
            .as_slice()
            .map_err(|_| PyValueError::new_err("holders must be C-contiguous"))?;
        let starts = seats_u8(&start_seats)?;
        let inner = &mut self.inner;
        py.detach(move || inner.reset_hands(h, &starts)).map_err(value_error)
    }

    /// A dict of zeroed observation buffers for this batch: `seat`, `obs`, `legal`, `events`, `n_events`, and
    /// `critic` unless `critic=False`.
    #[pyo3(signature = (critic=true))]
    fn make_buffers<'py>(&self, py: Python<'py>, critic: bool) -> PyResult<Bound<'py, PyDict>> {
        let n = self.inner.len();
        let d = PyDict::new(py);
        d.set_item("seat", PyArray1::<u8>::zeros(py, [n], false))?;
        d.set_item("obs", PyArray2::<u8>::zeros(py, [n, ve::OBS_LEN], false))?;
        d.set_item("legal", PyArray2::<u8>::zeros(py, [n, ve::LEGAL_LEN], false))?;
        d.set_item(
            "events",
            PyArray3::<u8>::zeros(py, [n, ve::MAX_EVENTS, ve::EVENT_LEN], false),
        )?;
        d.set_item("n_events", PyArray1::<u8>::zeros(py, [n], false))?;
        if critic {
            d.set_item("critic", PyArray2::<u8>::zeros(py, [n, ve::CRITIC_LEN], false))?;
        }
        Ok(d)
    }

    /// Fill the buffers in place with every game's observation for its acting seat. The event rows are the public
    /// events since that seat's previous observation (and this observation consumes them).
    fn observe(&mut self, py: Python<'_>, bufs: &Bound<'_, PyDict>) -> PyResult<()> {
        let n = self.inner.len();
        let mut b = Borrowed::from_dict(bufs, n)?;
        let out = b.slices()?;
        let inner = &mut self.inner;
        py.detach(move || inner.observe(out)).map_err(value_error)
    }

    /// Apply one action code a game (an int32 or int64 array of n) for its acting seat. Returns `(reward,
    /// terminated, truncated)`: float32 (n, 2), the reward of team 0 and of team 1 (+1 win, -1 loss, on the step a
    /// game finishes; else 0), and two bool (n,) flags (finished; hit the 6,000-step cap). With `bufs`, every game
    /// is observed after the step (and after any auto-reset) in the same parallel pass.
    #[pyo3(signature = (actions, bufs=None))]
    fn step<'py>(
        &mut self,
        py: Python<'py>,
        actions: &Bound<'py, PyAny>,
        bufs: Option<&Bound<'py, PyDict>>,
    ) -> PyResult<Bound<'py, PyTuple>> {
        let n = self.inner.len();
        let reward = PyArray2::<f32>::zeros(py, [n, 2], false);
        let terminated = PyArray1::<bool>::zeros(py, [n], false);
        let truncated = PyArray1::<bool>::zeros(py, [n], false);
        {
            let mut rw = reward.readwrite();
            let mut tw = terminated.readwrite();
            let mut uw = truncated.readwrite();
            let res = StepOut {
                reward: rw.as_slice_mut().expect("a new array is contiguous"),
                terminated: tw.as_slice_mut().expect("a new array is contiguous"),
                truncated: uw.as_slice_mut().expect("a new array is contiguous"),
            };
            let mut b = match bufs {
                Some(d) => Some(Borrowed::from_dict(d, n)?),
                None => None,
            };
            let obs = match b.as_mut() {
                Some(b) => Some(b.slices()?),
                None => None,
            };
            let a32;
            let acts: &[i32] = if let Ok(a) = actions.cast::<PyArray1<i32>>() {
                a32 = a.readonly();
                a32.as_slice()
                    .map_err(|_| PyValueError::new_err("actions must be contiguous"))?
            } else if let Ok(a) = actions.cast::<PyArray1<i64>>() {
                let r = a.readonly();
                let s = r
                    .as_slice()
                    .map_err(|_| PyValueError::new_err("actions must be contiguous"))?;
                self.actions32.clear();
                for &x in s {
                    self.actions32.push(i32::try_from(x).unwrap_or(-1));
                }
                &self.actions32
            } else {
                return Err(PyTypeError::new_err("actions must be a 1-d int32 or int64 array"));
            };
            let inner = &mut self.inner;
            py.detach(move || inner.step(acts, res, obs)).map_err(value_error)?;
        }
        PyTuple::new(py, [reward.into_any(), terminated.into_any(), truncated.into_any()])
    }

    /// The replay format's digests (needs `track_digests=True`), as three uint64 arrays `(d, l, v)`: d is the state
    /// chain after the last applied step (the deal digest before any), l and v are the legal-move and view digests
    /// of the current state for its acting seat (replay-format.md §4.6, §4.7, §5).
    fn digests<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyTuple>> {
        let n = self.inner.len();
        let (mut d, mut l, mut v) = (vec![0u64; n], vec![0u64; n], vec![0u64; n]);
        self.inner.digests(&mut d, &mut l, &mut v).map_err(value_error)?;
        PyTuple::new(
            py,
            [
                PyArray1::from_vec(py, d).into_any(),
                PyArray1::from_vec(py, l).into_any(),
                PyArray1::from_vec(py, v).into_any(),
            ],
        )
    }

    /// Actions applied to each game so far (uint32, n).
    fn steps<'py>(&self, py: Python<'py>) -> Bound<'py, PyArray1<u32>> {
        let v: Vec<u32> = (0..self.inner.len()).map(|i| self.inner.steps_of(i)).collect();
        PyArray1::from_vec(py, v)
    }

    /// Each game's end (uint8, n): 0 running, 1 finished, 2 capped. With auto-reset on, games never stay ended.
    fn ended<'py>(&self, py: Python<'py>) -> Bound<'py, PyArray1<u8>> {
        let v: Vec<u8> = (0..self.inner.len()).map(|i| self.inner.ended(i)).collect();
        PyArray1::from_vec(py, v)
    }

    /// Each game's score by team, absolute (uint8, n x 2).
    fn scores<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyArray2<u8>>> {
        let v: Vec<Vec<u8>> = (0..self.inner.len())
            .map(|i| self.inner.game(i).score().to_vec())
            .collect();
        PyArray2::from_vec2(py, &v).map_err(|e| PyValueError::new_err(e.to_string()))
    }

    /// Each game's seed (a list of str; `deal` for a game from `reset_deals`).
    fn seeds(&self) -> Vec<String> {
        (0..self.inner.len()).map(|i| self.inner.seed(i).to_string()).collect()
    }

    /// Each game's start seat (uint8, n).
    fn start_seats<'py>(&self, py: Python<'py>) -> Bound<'py, PyArray1<u8>> {
        let v: Vec<u8> = (0..self.inner.len()).map(|i| self.inner.start_seat(i)).collect();
        PyArray1::from_vec(py, v)
    }

    /// The counters so far, as a dict: steps, finished, capped, ended_steps (the actions of the games that ended),
    /// wins_team0, wins_team1, observations, max_backlog, auto_resets.
    fn stats<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyDict>> {
        let s = self.inner.stats();
        let d = PyDict::new(py);
        d.set_item("steps", s.steps)?;
        d.set_item("finished", s.finished)?;
        d.set_item("capped", s.capped)?;
        d.set_item("ended_steps", s.ended_steps)?;
        d.set_item("wins_team0", s.wins[0])?;
        d.set_item("wins_team1", s.wins[1])?;
        d.set_item("observations", s.observations)?;
        d.set_item("max_backlog", s.max_backlog)?;
        d.set_item("auto_resets", s.auto_resets)?;
        Ok(d)
    }

    /// G0c's control, in a `mutants` build only (`maturin build --release --features mutants`): plant one of the
    /// core's G0a mutants, `"M1"`..`"M5"`, in every game of the batch, now and in every game dealt later; `"none"`
    /// restores the reference's rules. A default build has no such method (`athena_env.MUTANTS` is False).
    #[cfg(feature = "mutants")]
    fn set_mutant(&mut self, name: &str) -> PyResult<()> {
        let m = athena_core::rules::Mutant::parse(name)
            .ok_or_else(|| PyValueError::new_err(format!("{name:?} is not a mutant (M1-M5 or none)")))?;
        self.inner.set_mutant(m);
        Ok(())
    }

    /// Test hook for the information rules: re-deal the cards game i's acting seat cannot see among the seats that
    /// hold them, keeping every hand count (and whether the turn-holder could ask). The acting seat's `seatView` is
    /// unchanged; its actor buffers must be too. Returns whether any card moved.
    fn debug_permute_hidden(&mut self, i: usize, rng_seed: u32) -> PyResult<bool> {
        if i >= self.inner.len() {
            return Err(PyValueError::new_err(format!("game {i} is out of range")));
        }
        Ok(self.inner.debug_permute_hidden(i, rng_seed))
    }
}

fn seats_u8(v: &[i64]) -> PyResult<Vec<u8>> {
    v.iter()
        .map(|&s| {
            if (0..NSEATS as i64).contains(&s) {
                Ok(s as u8)
            } else {
                Err(PyValueError::new_err(format!("start seat {s} is not a seat 0-5")))
            }
        })
        .collect()
}

/// `decode_action(seat, code)`: what a code means for an acting seat, with absolute seats, as a tuple:
/// `("ask", seat, target, card)`, `("decline", seat)`, `("pass", seat, to)` or `("declare", seat, set, (six seats))`.
#[pyfunction]
fn decode_action<'py>(py: Python<'py>, seat: u8, code: i32) -> PyResult<Bound<'py, PyTuple>> {
    let a = ve::decode_action(seat, code)
        .ok_or_else(|| PyValueError::new_err(format!("code {code} for seat {seat} is not an action")))?;
    match a {
        Action::Ask { seat, target, card } => ("ask", seat, target, card).into_pyobject(py),
        Action::Decline { seat } => ("decline", seat).into_pyobject(py),
        Action::Pass { seat, to } => ("pass", seat, to).into_pyobject(py),
        Action::Claim { seat, set, assign } => ("declare", seat, set, assign.map(u32::from)).into_pyobject(py),
    }
}

/// `encode_action(kind, seat, ...)`: the code of an action given with absolute seats, the inverse of
/// `decode_action`: `("ask", seat, target, card)`, `("decline", seat)`, `("pass", seat, to)` or
/// `("declare", seat, set, [six seats])`. Raises for an action with no code (an ask of a teammate, ...).
#[pyfunction]
#[pyo3(signature = (kind, seat, *args))]
fn encode_action(kind: &str, seat: u8, args: &Bound<'_, PyTuple>) -> PyResult<i32> {
    let a = match (kind, args.len()) {
        ("ask", 2) => Action::Ask {
            seat,
            target: args.get_item(0)?.extract()?,
            card: args.get_item(1)?.extract()?,
        },
        ("decline", 0) => Action::Decline { seat },
        ("pass", 1) => Action::Pass {
            seat,
            to: args.get_item(0)?.extract()?,
        },
        ("declare", 2) => {
            let v: Vec<u8> = args.get_item(1)?.extract()?;
            let assign: [u8; 6] = v
                .try_into()
                .map_err(|_| PyValueError::new_err("a declare states six seats"))?;
            Action::Claim {
                seat,
                set: args.get_item(0)?.extract()?,
                assign,
            }
        }
        _ => {
            return Err(PyValueError::new_err(format!(
                "unknown action {kind:?} with {} arguments",
                args.len()
            )))
        }
    };
    ve::encode_action(&a).ok_or_else(|| PyValueError::new_err(format!("{a:?} has no action code")))
}

#[pymodule]
#[pyo3(name = "athena_env")]
fn athena_env_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<BatchEnv>()?;
    m.add_function(wrap_pyfunction!(decode_action, m)?)?;
    m.add_function(wrap_pyfunction!(encode_action, m)?)?;
    // Whether this build can plant G0a's mutants (`BatchEnv.set_mutant`): False in every default build.
    m.add("MUTANTS", cfg!(feature = "mutants"))?;
    m.add("NONE", NONE)?;
    m.add("STEP_CAP", STEP_CAP)?;
    m.add("N_CARDS", NCARDS)?;
    m.add("N_SETS", NSETS)?;
    // Lists of ints (a Vec<u8> would convert to bytes).
    let set_cards: Vec<Vec<u32>> = SET_CARDS
        .iter()
        .map(|s| s.iter().map(|&c| c as u32).collect())
        .collect();
    m.add("SET_CARDS", set_cards)?;
    m.add("SET_NAMES", SET_NAMES.to_vec())?;
    // Action codes.
    m.add("N_ASK", ve::N_ASK)?;
    m.add("A_DECLINE", ve::A_DECLINE)?;
    m.add("A_PASS", ve::A_PASS)?;
    m.add("A_DECLARE", ve::A_DECLARE)?;
    m.add("N_ASSIGN", ve::N_ASSIGN)?;
    m.add("N_ACTIONS", ve::N_ACTIONS)?;
    // The legal row.
    m.add("L_ASK", ve::L_ASK)?;
    m.add("L_DECLARE", ve::L_DECLARE)?;
    m.add("L_DECLINE", ve::L_DECLINE)?;
    m.add("L_PASS", ve::L_PASS)?;
    m.add("LEGAL_LEN", ve::LEGAL_LEN)?;
    // The observation row.
    m.add("O_HAND", ve::O_HAND)?;
    m.add("O_COUNTS", ve::O_COUNTS)?;
    m.add("O_PHASE", ve::O_PHASE)?;
    m.add("O_TURN", ve::O_TURN)?;
    m.add("O_WINDOW", ve::O_WINDOW)?;
    m.add("O_OPTION", ve::O_OPTION)?;
    m.add("O_DECLINED", ve::O_DECLINED)?;
    m.add("O_SCORE", ve::O_SCORE)?;
    m.add("O_SETS", ve::O_SETS)?;
    m.add("SET_FIELDS", ve::SET_FIELDS)?;
    m.add("OBS_LEN", ve::OBS_LEN)?;
    // The event rows.
    m.add("E_TYPE", ve::E_TYPE)?;
    m.add("E_ACTOR", ve::E_ACTOR)?;
    m.add("E_TARGET", ve::E_TARGET)?;
    m.add("E_CARD", ve::E_CARD)?;
    m.add("E_HIT", ve::E_HIT)?;
    m.add("E_SET", ve::E_SET)?;
    m.add("E_RESULT", ve::E_RESULT)?;
    m.add("E_ASSIGN", ve::E_ASSIGN)?;
    m.add("E_HOLDERS", ve::E_HOLDERS)?;
    m.add("EVENT_LEN", ve::EVENT_LEN)?;
    m.add("MAX_EVENTS", ve::MAX_EVENTS)?;
    // The critic buffer.
    m.add("CRITIC_LEN", ve::CRITIC_LEN)?;
    Ok(())
}
