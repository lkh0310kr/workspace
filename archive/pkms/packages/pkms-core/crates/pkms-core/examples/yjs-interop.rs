use pkms_core::MarkdownDoc;

fn decode_hex(value: &str) -> Vec<u8> {
    assert_eq!(value.len() % 2, 0, "hex input must have even length");
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let text = std::str::from_utf8(pair).expect("hex input must be UTF-8");
            u8::from_str_radix(text, 16).expect("hex input must contain hex digits")
        })
        .collect()
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    match args.as_slice() {
        [command, first, index, value] if command == "insert" => {
            let document = MarkdownDoc::from_updates(202, &[decode_hex(first)])
                .expect("decode Yjs update");
            document
                .insert(index.parse().expect("UTF-16 index"), value)
                .expect("insert at UTF-16 index");
            println!("{}", encode_hex(&document.snapshot()));
        }
        [command, first, second] if command == "merge" => {
            let document = MarkdownDoc::from_updates(
                303,
                &[decode_hex(first), decode_hex(second)],
            )
            .expect("merge Yjs updates");
            print!("{}", document.text());
        }
        _ => panic!("usage: yjs-interop insert <update-hex> <utf16-index> <text> | merge <update-hex> <update-hex>"),
    }
}
