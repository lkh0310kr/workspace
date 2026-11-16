use std::sync::{Arc, Mutex};
use pkms_core::MarkdownDoc;
use std::slice;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum FfiError {
    #[error("invalid document update")]
    InvalidUpdate,
    #[error("text range is invalid")]
    InvalidRange,
}

impl From<pkms_core::CoreError> for FfiError {
    fn from(value: pkms_core::CoreError) -> Self {
        match value {
            pkms_core::CoreError::InvalidDocumentUpdate => Self::InvalidUpdate,
            _ => Self::InvalidRange,
        }
    }
}

#[derive(uniffi::Object)]
pub struct SharedMarkdownDoc {
    inner: Mutex<MarkdownDoc>,
}

#[repr(C)]
pub struct PkmsByteBuffer {
    pub data: *mut u8,
    pub len: usize,
}

fn buffer(bytes: Vec<u8>) -> PkmsByteBuffer {
    let mut boxed = bytes.into_boxed_slice();
    let result = PkmsByteBuffer { data: boxed.as_mut_ptr(), len: boxed.len() };
    std::mem::forget(boxed);
    result
}

#[unsafe(no_mangle)]
pub extern "C" fn pkms_doc_new(client_id: u64) -> *mut SharedMarkdownDoc {
    Box::into_raw(Box::new(SharedMarkdownDoc { inner: Mutex::new(MarkdownDoc::new(client_id)) }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_free(handle: *mut SharedMarkdownDoc) {
    if !handle.is_null() { drop(unsafe { Box::from_raw(handle) }); }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_text(handle: *const SharedMarkdownDoc) -> PkmsByteBuffer {
    let Some(handle) = (unsafe { handle.as_ref() }) else { return buffer(Vec::new()); };
    buffer(handle.inner.lock().expect("document mutex poisoned").text().into_bytes())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_snapshot(handle: *const SharedMarkdownDoc) -> PkmsByteBuffer {
    let Some(handle) = (unsafe { handle.as_ref() }) else { return buffer(Vec::new()); };
    buffer(handle.inner.lock().expect("document mutex poisoned").snapshot())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_state_vector(handle: *const SharedMarkdownDoc) -> PkmsByteBuffer {
    let Some(handle) = (unsafe { handle.as_ref() }) else { return buffer(Vec::new()); };
    buffer(handle.inner.lock().expect("document mutex poisoned").state_vector())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_apply_update(handle: *mut SharedMarkdownDoc, data: *const u8, len: usize) -> i32 {
    let (Some(handle), Some(data)) = (unsafe { handle.as_ref() }, unsafe { input_slice(data, len) }) else { return -1; };
    match handle.inner.lock().expect("document mutex poisoned").apply_update(data) { Ok(_) => 0, Err(_) => -1 }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_insert(handle: *mut SharedMarkdownDoc, index_utf16: u32, data: *const u8, len: usize) -> PkmsByteBuffer {
    let (Some(handle), Some(data)) = (unsafe { handle.as_ref() }, unsafe { input_slice(data, len) }) else { return buffer(Vec::new()); };
    let Ok(value) = std::str::from_utf8(data) else { return buffer(Vec::new()); };
    handle.inner.lock().expect("document mutex poisoned").insert(index_utf16, value).map(buffer).unwrap_or_else(|_| buffer(Vec::new()))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_doc_delete(handle: *mut SharedMarkdownDoc, index_utf16: u32, length_utf16: u32) -> PkmsByteBuffer {
    let Some(handle) = (unsafe { handle.as_ref() }) else { return buffer(Vec::new()); };
    handle.inner.lock().expect("document mutex poisoned").delete(index_utf16, length_utf16).map(buffer).unwrap_or_else(|_| buffer(Vec::new()))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pkms_buffer_free(data: *mut u8, len: usize) {
    if !data.is_null() { drop(unsafe { Box::from_raw(slice::from_raw_parts_mut(data, len)) }); }
}

unsafe fn input_slice<'a>(data: *const u8, len: usize) -> Option<&'a [u8]> {
    if len == 0 { Some(&[]) } else if data.is_null() { None } else { Some(unsafe { slice::from_raw_parts(data, len) }) }
}

#[uniffi::export]
impl SharedMarkdownDoc {
    #[uniffi::constructor]
    pub fn new(client_id: u64) -> Arc<Self> {
        Arc::new(Self { inner: Mutex::new(MarkdownDoc::new(client_id)) })
    }

    pub fn text(&self) -> String {
        self.inner.lock().expect("document mutex poisoned").text()
    }

    pub fn insert(&self, index_utf16: u32, value: String) -> Result<Vec<u8>, FfiError> {
        self.inner.lock().expect("document mutex poisoned")
            .insert(index_utf16, &value).map_err(Into::into)
    }

    pub fn delete(&self, index_utf16: u32, length_utf16: u32) -> Result<Vec<u8>, FfiError> {
        self.inner.lock().expect("document mutex poisoned")
            .delete(index_utf16, length_utf16).map_err(Into::into)
    }

    pub fn apply_update(&self, update: Vec<u8>) -> Result<String, FfiError> {
        self.inner.lock().expect("document mutex poisoned")
            .apply_update(&update).map_err(Into::into)
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.inner.lock().expect("document mutex poisoned").snapshot()
    }

    pub fn state_vector(&self) -> Vec<u8> {
        self.inner.lock().expect("document mutex poisoned").state_vector()
    }
}
