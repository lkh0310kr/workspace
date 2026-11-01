#ifndef PKMS_FFI_H
#define PKMS_FFI_H

#include <stddef.h>
#include <stdint.h>

typedef struct SharedMarkdownDoc SharedMarkdownDoc;
typedef struct { uint8_t *data; size_t len; } PkmsByteBuffer;

SharedMarkdownDoc *pkms_doc_new(uint64_t client_id);
void pkms_doc_free(SharedMarkdownDoc *handle);
PkmsByteBuffer pkms_doc_text(const SharedMarkdownDoc *handle);
PkmsByteBuffer pkms_doc_snapshot(const SharedMarkdownDoc *handle);
PkmsByteBuffer pkms_doc_state_vector(const SharedMarkdownDoc *handle);
int32_t pkms_doc_apply_update(SharedMarkdownDoc *handle, const uint8_t *data, size_t len);
PkmsByteBuffer pkms_doc_insert(SharedMarkdownDoc *handle, uint32_t index_utf16, const uint8_t *data, size_t len);
PkmsByteBuffer pkms_doc_delete(SharedMarkdownDoc *handle, uint32_t index_utf16, uint32_t length_utf16);
void pkms_buffer_free(uint8_t *data, size_t len);

#endif
