#!/usr/bin/env python3
"""
Chroma client script for Node.js backend integration
Handles collection management and document operations via Python chromadb client
"""

import sys
import json
import chromadb
from typing import List, Dict, Any

def get_client():
    """Get Chroma HTTP client"""
    return chromadb.HttpClient(host='localhost', port=8000)

def create_collection(collection_name: str, metadata: Dict[str, Any] = None):
    """Create a collection if it doesn't exist"""
    try:
        client = get_client()
        
        # Check if collection already exists
        existing_collections = [c.name for c in client.list_collections()]
        if collection_name in existing_collections:
            return {"success": True, "message": f"Collection '{collection_name}' already exists"}
        
        # Create new collection
        collection = client.create_collection(
            name=collection_name,
            metadata=metadata or {"description": "PDF document chunks for RAG search"}
        )
        return {"success": True, "message": f"Collection '{collection_name}' created successfully"}
    
    except Exception as e:
        return {"success": False, "error": str(e)}

def add_documents(collection_name: str, documents: List[str], metadatas: List[Dict], ids: List[str], embeddings: List[List[float]]):
    """Add documents to collection"""
    try:
        client = get_client()
        collection = client.get_collection(name=collection_name)
        
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids,
            embeddings=embeddings
        )
        
        return {"success": True, "message": f"Added {len(documents)} documents to '{collection_name}'"}
    
    except Exception as e:
        return {"success": False, "error": str(e)}

def query_collection(collection_name: str, query_embeddings: List[List[float]], n_results: int = 5):
    """Query collection for similar documents"""
    try:
        client = get_client()
        collection = client.get_collection(name=collection_name)
        
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )
        
        return {"success": True, "results": results}
    
    except Exception as e:
        return {"success": False, "error": str(e)}

def list_collections():
    """List all collections"""
    try:
        client = get_client()
        collections = [c.name for c in client.list_collections()]
        return {"success": True, "collections": collections}
    
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command provided"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == "create_collection":
            collection_name = sys.argv[2]
            metadata = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None
            result = create_collection(collection_name, metadata)
        
        elif command == "add_documents":
            collection_name = sys.argv[2]
            data = json.loads(sys.argv[3])
            result = add_documents(
                collection_name,
                data["documents"],
                data["metadatas"],
                data["ids"],
                data["embeddings"]
            )
        
        elif command == "query":
            collection_name = sys.argv[2]
            data = json.loads(sys.argv[3])
            result = query_collection(
                collection_name,
                data["query_embeddings"],
                data.get("n_results", 5)
            )
        
        elif command == "list_collections":
            result = list_collections()
        
        else:
            result = {"success": False, "error": f"Unknown command: {command}"}
        
        print(json.dumps(result))
    
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
