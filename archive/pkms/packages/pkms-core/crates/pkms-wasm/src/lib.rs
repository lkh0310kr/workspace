use pkms_core::MarkdownDoc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmMarkdownDoc {
    inner: MarkdownDoc,
}

#[wasm_bindgen]
impl WasmMarkdownDoc {
    #[wasm_bindgen(constructor)]
    pub fn new(client_id: u64) -> Self {
        Self { inner: MarkdownDoc::new(client_id) }
    }

    pub fn text(&self) -> String {
        self.inner.text()
    }

    pub fn insert(&self, index_utf16: u32, value: &str) -> Result<Vec<u8>, JsError> {
        self.inner.insert(index_utf16, value).map_err(|error| JsError::new(&error.to_string()))
    }

    pub fn delete(&self, index_utf16: u32, length_utf16: u32) -> Result<Vec<u8>, JsError> {
        self.inner.delete(index_utf16, length_utf16).map_err(|error| JsError::new(&error.to_string()))
    }

    pub fn apply_update(&self, update: &[u8]) -> Result<String, JsError> {
        self.inner.apply_update(update).map_err(|error| JsError::new(&error.to_string()))
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.inner.snapshot()
    }

    pub fn state_vector(&self) -> Vec<u8> {
        self.inner.state_vector()
    }
}
