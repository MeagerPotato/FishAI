//! A small JSON reader (RFC 8259) with the standard library alone. D12 (ATHENA.md §5) keeps the crate's only
//! dependencies to the Python bindings, so the bridge's `fish_record` lines are read here rather than by a crate.
//!
//! It reads what JavaScript's `JSON.parse` reads, which is what `scripts/bridge-records.mjs` uses, and refuses what
//! it refuses: a number is an `f64`, as JavaScript holds it; whitespace is space, tab, LF and CR; a duplicate key
//! keeps its last value. The one difference is a lone UTF-16 surrogate in a `\u` escape, which a Rust `String` cannot
//! hold: it becomes U+FFFD. No bridge record carries one.

/// A JSON value.
#[derive(Clone, Debug, PartialEq)]
pub enum Json {
    /// `null`.
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// A number, as JavaScript holds it.
    Num(f64),
    /// A string.
    Str(String),
    /// An array.
    Arr(Vec<Json>),
    /// An object, its members in document order.
    Obj(Vec<(String, Json)>),
}

/// Why a text is not JSON: the byte offset and what was wrong there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonError {
    /// Byte offset into the text.
    pub at: usize,
    /// What was expected or found.
    pub what: &'static str,
}

impl std::fmt::Display for JsonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "not JSON at byte {}: {}", self.at, self.what)
    }
}

impl std::error::Error for JsonError {}

/// Nesting deeper than this is refused rather than risking the stack. A bridge record nests three deep.
pub const MAX_DEPTH: usize = 256;

impl Json {
    /// An object's member (the last one, as `JSON.parse` keeps it, if the key repeats).
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(members) => members.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// An array's elements.
    pub fn as_array(&self) -> Option<&[Json]> {
        match self {
            Json::Arr(a) => Some(a),
            _ => None,
        }
    }

    /// A number's value.
    pub fn as_f64(&self) -> Option<f64> {
        match *self {
            Json::Num(x) => Some(x),
            _ => None,
        }
    }

    /// A string's text.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }

    /// A number that is a non-negative integer below 2^53, as an index.
    pub fn as_index(&self) -> Option<usize> {
        let x = self.as_f64()?;
        if x >= 0.0 && x.fract() == 0.0 && x < 9_007_199_254_740_992.0 {
            Some(x as usize)
        } else {
            None
        }
    }

    /// JavaScript's truthiness (`!!x`): false for null, false, 0, NaN and the empty string.
    pub fn truthy(&self) -> bool {
        match self {
            Json::Null => false,
            Json::Bool(b) => *b,
            Json::Num(x) => *x != 0.0 && !x.is_nan(),
            Json::Str(s) => !s.is_empty(),
            Json::Arr(_) | Json::Obj(_) => true,
        }
    }

    /// JavaScript's `String(x)` for the values a record uses as labels: a number or a string. An integer prints
    /// without a fraction, as JavaScript prints it below 10^21.
    pub fn js_string(&self) -> String {
        match self {
            Json::Num(x) if x.fract() == 0.0 && x.abs() < 1e21 => format!("{}", *x as i128),
            Json::Num(x) => format!("{x}"),
            Json::Str(s) => s.clone(),
            Json::Null => "null".to_string(),
            Json::Bool(b) => b.to_string(),
            Json::Arr(_) => "[array]".to_string(),
            Json::Obj(_) => "[object Object]".to_string(),
        }
    }
}

/// Parse one JSON text (a whole record line). Surrounding whitespace is allowed; anything else after the value is not.
pub fn parse(text: &str) -> Result<Json, JsonError> {
    let mut p = Parser {
        b: text.as_bytes(),
        i: 0,
    };
    p.ws();
    let v = p.value(0)?;
    p.ws();
    if p.i != p.b.len() {
        return Err(p.err("trailing text after the value"));
    }
    Ok(v)
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn err(&self, what: &'static str) -> JsonError {
        JsonError { at: self.i, what }
    }

    #[inline]
    fn ws(&mut self) {
        while let Some(&c) = self.b.get(self.i) {
            if c == b' ' || c == b'\t' || c == b'\n' || c == b'\r' {
                self.i += 1;
            } else {
                break;
            }
        }
    }

    fn lit(&mut self, word: &'static [u8], v: Json) -> Result<Json, JsonError> {
        if self.b[self.i..].starts_with(word) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(self.err("an unknown literal"))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, JsonError> {
        if depth > MAX_DEPTH {
            return Err(self.err("nesting too deep"));
        }
        match self.b.get(self.i) {
            None => Err(self.err("the text ended where a value was expected")),
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => Ok(Json::Str(self.string()?)),
            Some(b't') => self.lit(b"true", Json::Bool(true)),
            Some(b'f') => self.lit(b"false", Json::Bool(false)),
            Some(b'n') => self.lit(b"null", Json::Null),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(_) => Err(self.err("an unexpected character")),
        }
    }

    fn array(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.i += 1;
        let mut out = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b']') {
            self.i += 1;
            return Ok(Json::Arr(out));
        }
        loop {
            self.ws();
            out.push(self.value(depth + 1)?);
            self.ws();
            match self.b.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b']') => {
                    self.i += 1;
                    return Ok(Json::Arr(out));
                }
                _ => return Err(self.err("expected ',' or ']' in an array")),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, JsonError> {
        self.i += 1;
        let mut out = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b'}') {
            self.i += 1;
            return Ok(Json::Obj(out));
        }
        loop {
            self.ws();
            if self.b.get(self.i) != Some(&b'"') {
                return Err(self.err("expected a string key"));
            }
            let k = self.string()?;
            self.ws();
            if self.b.get(self.i) != Some(&b':') {
                return Err(self.err("expected ':' after a key"));
            }
            self.i += 1;
            self.ws();
            let v = self.value(depth + 1)?;
            out.push((k, v));
            self.ws();
            match self.b.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    return Ok(Json::Obj(out));
                }
                _ => return Err(self.err("expected ',' or '}' in an object")),
            }
        }
    }

    fn digits(&mut self) -> usize {
        let from = self.i;
        while self.b.get(self.i).is_some_and(u8::is_ascii_digit) {
            self.i += 1;
        }
        self.i - from
    }

    /// `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?`, then the correctly rounded f64, as `JSON.parse` gives.
    fn number(&mut self) -> Result<Json, JsonError> {
        let from = self.i;
        if self.b.get(self.i) == Some(&b'-') {
            self.i += 1;
        }
        match self.b.get(self.i) {
            Some(b'0') => self.i += 1,
            Some(b'1'..=b'9') => {
                self.digits();
            }
            _ => return Err(self.err("a number without digits")),
        }
        if self.b.get(self.i) == Some(&b'.') {
            self.i += 1;
            if self.digits() == 0 {
                return Err(self.err("a fraction without digits"));
            }
        }
        if matches!(self.b.get(self.i), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.b.get(self.i), Some(b'+' | b'-')) {
                self.i += 1;
            }
            if self.digits() == 0 {
                return Err(self.err("an exponent without digits"));
            }
        }
        // The slice is ASCII by construction.
        let text = std::str::from_utf8(&self.b[from..self.i]).map_err(|_| self.err("a number"))?;
        text.parse::<f64>().map(Json::Num).map_err(|_| self.err("a number"))
    }

    fn hex4(&mut self) -> Result<u32, JsonError> {
        let mut v = 0u32;
        for _ in 0..4 {
            let c = *self.b.get(self.i).ok_or_else(|| self.err("a short \\u escape"))?;
            let d = (c as char).to_digit(16).ok_or_else(|| self.err("a bad \\u escape"))?;
            v = (v << 4) | d;
            self.i += 1;
        }
        Ok(v)
    }

    fn string(&mut self) -> Result<String, JsonError> {
        self.i += 1;
        let mut out = String::new();
        loop {
            // Copy the run up to the next quote, backslash or control character in one piece.
            let from = self.i;
            while let Some(&c) = self.b.get(self.i) {
                if c == b'"' || c == b'\\' || c < 0x20 {
                    break;
                }
                self.i += 1;
            }
            // The text is a &str and the run stops only at ASCII bytes, so the run is whole UTF-8.
            out.push_str(std::str::from_utf8(&self.b[from..self.i]).map_err(|_| self.err("invalid UTF-8"))?);
            match self.b.get(self.i) {
                None => return Err(self.err("an unterminated string")),
                Some(b'"') => {
                    self.i += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    self.i += 1;
                    let e = *self.b.get(self.i).ok_or_else(|| self.err("an unterminated escape"))?;
                    self.i += 1;
                    match e {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let hi = self.hex4()?;
                            let ch = if (0xD800..0xDC00).contains(&hi)
                                && self.b.get(self.i) == Some(&b'\\')
                                && self.b.get(self.i + 1) == Some(&b'u')
                            {
                                let save = self.i;
                                self.i += 2;
                                let lo = self.hex4()?;
                                if (0xDC00..0xE000).contains(&lo) {
                                    char::from_u32(0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00))
                                } else {
                                    self.i = save;
                                    None
                                }
                            } else {
                                char::from_u32(hi)
                            };
                            out.push(ch.unwrap_or('\u{FFFD}'));
                        }
                        _ => {
                            self.i -= 1;
                            return Err(self.err("an unknown escape"));
                        }
                    }
                }
                Some(_) => return Err(self.err("a raw control character in a string")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_of_every_kind() {
        let v = parse(r#" {"a": [1, -2.5, 3e2, 0, -0], "b": true, "c": false, "d": null, "e": "x\"y\\z\/\n\u00e9"} "#)
            .unwrap();
        assert_eq!(
            v.get("a").unwrap().as_array().unwrap(),
            &[
                Json::Num(1.0),
                Json::Num(-2.5),
                Json::Num(300.0),
                Json::Num(0.0),
                Json::Num(-0.0)
            ]
        );
        assert_eq!(v.get("b"), Some(&Json::Bool(true)));
        assert_eq!(v.get("c"), Some(&Json::Bool(false)));
        assert_eq!(v.get("d"), Some(&Json::Null));
        assert_eq!(v.get("e").unwrap().as_str(), Some("x\"y\\z/\n\u{e9}"));
        assert_eq!(v.get("zz"), None);
    }

    #[test]
    fn a_record_shaped_line() {
        let line = r#"{"deal":11,"rot":0,"orient":1,"seed":"5574","dealt":[[1,2],[3]],"events":[[0,1,4,41,6,0,[0,0,0,0,0,0],[9,9,9,9,9,9]]],"hitLimit":false}"#;
        let v = parse(line).unwrap();
        assert_eq!(v.get("deal").unwrap().as_index(), Some(11));
        assert_eq!(v.get("deal").unwrap().js_string(), "11");
        assert_eq!(v.get("seed").unwrap().js_string(), "5574");
        let ev = &v.get("events").unwrap().as_array().unwrap()[0];
        let ev = ev.as_array().unwrap();
        assert_eq!(ev.len(), 8);
        assert_eq!(ev[3].as_index(), Some(41));
        assert!(!ev[5].truthy());
        assert_eq!(ev[7].as_array().unwrap().len(), 6);
    }

    #[test]
    fn javascript_semantics() {
        // A duplicate key keeps its last value, as JSON.parse does.
        assert_eq!(parse(r#"{"k":1,"k":2}"#).unwrap().get("k"), Some(&Json::Num(2.0)));
        // Truthiness.
        for (text, want) in [
            ("0", false),
            ("1", true),
            ("-0", false),
            ("0.5", true),
            ("\"\"", false),
            ("\"0\"", true),
            ("null", false),
            ("true", true),
            ("false", false),
            ("[]", true),
            ("{}", true),
        ] {
            assert_eq!(parse(text).unwrap().truthy(), want, "{text}");
        }
        // Indices are non-negative integers.
        assert_eq!(parse("3").unwrap().as_index(), Some(3));
        assert_eq!(parse("3.0").unwrap().as_index(), Some(3));
        assert_eq!(parse("3.5").unwrap().as_index(), None);
        assert_eq!(parse("-1").unwrap().as_index(), None);
        assert_eq!(parse("\"3\"").unwrap().as_index(), None);
        // Numbers are correctly rounded doubles.
        assert_eq!(parse("0.1").unwrap(), Json::Num(0.1));
        assert_eq!(parse("1E-2").unwrap(), Json::Num(0.01));
        assert_eq!(
            parse("123456789012345678901234567890").unwrap(),
            Json::Num(1.2345678901234568e29)
        );
        // Surrogate pairs, and a lone surrogate as U+FFFD.
        assert_eq!(parse(r#""\ud83d\ude00""#).unwrap().as_str(), Some("\u{1F600}"));
        assert_eq!(parse(r#""\ud83dx""#).unwrap().as_str(), Some("\u{FFFD}x"));
        // CR is whitespace, so a CRLF line parses.
        assert!(parse("[1]\r").is_ok());
    }

    #[test]
    fn refuses_what_json_parse_refuses() {
        for bad in [
            "",
            " ",
            "[1,]",
            "[1 2]",
            "{\"a\" 1}",
            "{a:1}",
            "{\"a\":1,}",
            "01",
            "1.",
            ".5",
            "+1",
            "1e",
            "-",
            "NaN",
            "Infinity",
            "tru",
            "\"abc",
            "\"a\tb\"",
            "\"\\x\"",
            "\"\\u12\"",
            "[1] [2]",
            "'a'",
        ] {
            assert!(parse(bad).is_err(), "{bad:?} should be refused");
        }
        let deep = "[".repeat(MAX_DEPTH + 2) + &"]".repeat(MAX_DEPTH + 2);
        assert!(parse(&deep).is_err());
        let ok = "[".repeat(MAX_DEPTH) + &"]".repeat(MAX_DEPTH);
        assert!(parse(&ok).is_ok());
    }
}
