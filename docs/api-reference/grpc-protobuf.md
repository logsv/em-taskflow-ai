# gRPC Protobuf Reference

The **Python AI Service** exposes high-performance binary RPC endpoints on **Port 50051** alongside its FastAPI REST endpoints on Port 8000.

---

## 📡 Service Definition

Located in `services/python-ai-service/app/grpc_server/rag_service.proto`:

```protobuf
syntax = "proto3";

package rag;

service RAGService {
  rpc ExtractDocument (ExtractRequest) returns (ExtractResponse);
  rpc ProcessRAGIngestion (IngestRequest) returns (IngestResponse);
  rpc RerankChunks (RerankRequest) returns (RerankResponse);
}

message ExtractRequest {
  bytes file_content = 1;
  string filename = 2;
  string mime_type = 3;
}

message ExtractResponse {
  string extracted_text = 1;
  int32 char_count = 2;
  string summary = 3;
}

message IngestRequest {
  string filename = 1;
  string text_content = 2;
  string metadata_json = 3;
}

message IngestResponse {
  bool success = 1;
  int32 chunk_count = 2;
  string document_id = 3;
}

message RerankRequest {
  string query = 1;
  repeated string candidate_chunks = 2;
  int32 top_k = 3;
}

message RerankResponse {
  repeated RankedChunk ranked_chunks = 1;
}

message RankedChunk {
  string chunk_text = 1;
  float relevance_score = 2;
  int32 original_index = 3;
}
```
