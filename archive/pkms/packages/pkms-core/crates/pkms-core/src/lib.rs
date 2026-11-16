//! Platform-independent PKMS rules and the shared Yjs/Yrs Markdown document model.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use yrs::{
    ClientID, Doc, GetString, Options, OffsetKind, ReadTxn, StateVector, Text, Transact, Update,
};
use yrs::updates::{decoder::Decode, encoder::Encode};

pub const PROTOCOL_VERSION: u16 = 1;
pub const TEXT_ROOT: &str = "markdown";

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CoreError {
    #[error("path must be relative to the workspace root")]
    AbsolutePath,
    #[error("path contains an empty, dot, or parent component")]
    InvalidPathComponent,
    #[error("path contains a control character")]
    ControlCharacter,
    #[error("invalid Yjs/Yrs v1 update")]
    InvalidDocumentUpdate,
    #[error("text offset is outside the document")]
    InvalidTextRange,
}

/// A normalized workspace-relative path. Git paths are case-sensitive.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct VaultPath(String);

impl VaultPath {
    pub fn parse(value: impl Into<String>) -> Result<Self, CoreError> {
        let value = value.into();
        if value.is_empty() || value.starts_with('/') || value.starts_with('~') {
            return Err(CoreError::AbsolutePath);
        }
        if value.contains('\\') {
            return Err(CoreError::InvalidPathComponent);
        }
        for component in value.split('/') {
            if component.is_empty() || component == "." || component == ".." {
                return Err(CoreError::InvalidPathComponent);
            }
            if component.chars().any(char::is_control) {
                return Err(CoreError::ControlCharacter);
            }
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn parent(&self) -> Option<Self> {
        self.0.rsplit_once('/').map(|(parent, _)| Self(parent.to_owned()))
    }

    pub fn file_name(&self) -> &str {
        self.0.rsplit('/').next().unwrap_or(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum FileOperation {
    CreateFolder { path: VaultPath },
    CreateFile { path: VaultPath, file_id: String, content: String },
    Move { file_id: String, to_path: VaultPath },
    Delete { file_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperationEnvelope {
    pub protocol_version: u16,
    pub operation_id: String,
    pub base_revision: u64,
    pub operation: FileOperation,
}

impl OperationEnvelope {
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.protocol_version != PROTOCOL_VERSION || self.operation_id.is_empty() {
            return Err(CoreError::InvalidPathComponent);
        }
        Ok(())
    }
}

/// A Yjs-compatible CRDT document. Text offsets use UTF-16 to match JavaScript editors.
pub struct MarkdownDoc {
    doc: Doc,
}

impl MarkdownDoc {
    pub fn new(client_id: u64) -> Self {
        Self {
            doc: Doc::with_options(Options {
                client_id: ClientID::new(client_id),
                offset_kind: OffsetKind::Utf16,
                ..Options::default()
            }),
        }
    }

    pub fn from_updates(client_id: u64, updates: &[Vec<u8>]) -> Result<Self, CoreError> {
        let document = Self::new(client_id);
        for bytes in updates {
            let update = Update::decode_v1(bytes).map_err(|_| CoreError::InvalidDocumentUpdate)?;
            document.doc.transact_mut().apply_update(update)
                .map_err(|_| CoreError::InvalidDocumentUpdate)?;
        }
        Ok(document)
    }

    pub fn text(&self) -> String {
        let text = self.doc.get_or_insert_text(TEXT_ROOT);
        text.get_string(&self.doc.transact())
    }

    pub fn insert(&self, index_utf16: u32, value: &str) -> Result<Vec<u8>, CoreError> {
        let text = self.doc.get_or_insert_text(TEXT_ROOT);
        let mut transaction = self.doc.transact_mut();
        if index_utf16 > text.len(&transaction) {
            return Err(CoreError::InvalidTextRange);
        }
        text.insert(&mut transaction, index_utf16, value);
        Ok(transaction.encode_update_v1())
    }

    pub fn delete(&self, index_utf16: u32, length_utf16: u32) -> Result<Vec<u8>, CoreError> {
        let text = self.doc.get_or_insert_text(TEXT_ROOT);
        let mut transaction = self.doc.transact_mut();
        if index_utf16.saturating_add(length_utf16) > text.len(&transaction) {
            return Err(CoreError::InvalidTextRange);
        }
        text.remove_range(&mut transaction, index_utf16, length_utf16);
        Ok(transaction.encode_update_v1())
    }

    pub fn apply_update(&self, bytes: &[u8]) -> Result<String, CoreError> {
        let update = Update::decode_v1(bytes).map_err(|_| CoreError::InvalidDocumentUpdate)?;
        self.doc.transact_mut().apply_update(update)
            .map_err(|_| CoreError::InvalidDocumentUpdate)?;
        Ok(self.text())
    }

    pub fn state_vector(&self) -> Vec<u8> {
        self.doc.transact().state_vector().encode_v1()
    }

    pub fn encode_state(&self, state_vector: &[u8]) -> Result<Vec<u8>, CoreError> {
        let vector = StateVector::decode_v1(state_vector)
            .map_err(|_| CoreError::InvalidDocumentUpdate)?;
        Ok(self.doc.transact().encode_state_as_update_v1(&vector))
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.doc.transact().encode_state_as_update_v1(&StateVector::default())
    }
}
