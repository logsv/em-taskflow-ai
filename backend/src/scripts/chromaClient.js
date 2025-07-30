"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var chromadb_1 = require("chromadb");
var getClient = function (params) {
    // The default host is 'localhost' and port is 8000, which matches the python script.
    return new chromadb_1.ChromaClient(params);
};
var createCollection = function (collectionName, metadata) { return __awaiter(void 0, void 0, void 0, function () {
    var client, existingCollections, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                client = getClient();
                return [4 /*yield*/, client.listCollections()];
            case 1:
                existingCollections = _a.sent();
                if (existingCollections.map(function (c) { return c.name; }).includes(collectionName)) {
                    return [2 /*return*/, { success: true, message: "Collection '".concat(collectionName, "' already exists") }];
                }
                return [4 /*yield*/, client.createCollection({
                        name: collectionName,
                        metadata: metadata || { description: "PDF document chunks for RAG search" },
                    })];
            case 2:
                _a.sent();
                return [2 /*return*/, { success: true, message: "Collection '".concat(collectionName, "' created successfully") }];
            case 3:
                e_1 = _a.sent();
                return [2 /*return*/, { success: false, error: e_1.message }];
            case 4: return [2 /*return*/];
        }
    });
}); };
var addDocuments = function (collectionName, documents, metadatas, ids, embeddings) { return __awaiter(void 0, void 0, void 0, function () {
    var client, collection, e_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                client = getClient();
                return [4 /*yield*/, client.getCollection({ name: collectionName })];
            case 1:
                collection = _a.sent();
                return [4 /*yield*/, collection.add({
                        ids: ids,
                        embeddings: embeddings,
                        metadatas: metadatas,
                        documents: documents,
                    })];
            case 2:
                _a.sent();
                return [2 /*return*/, { success: true, message: "Added ".concat(documents.length, " documents to '").concat(collectionName, "'") }];
            case 3:
                e_2 = _a.sent();
                return [2 /*return*/, { success: false, error: e_2.message }];
            case 4: return [2 /*return*/];
        }
    });
}); };
var queryCollection = function (collectionName_1, queryEmbeddings_1) {
    var args_1 = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args_1[_i - 2] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([collectionName_1, queryEmbeddings_1], args_1, true), void 0, function (collectionName, queryEmbeddings, nResults) {
        var client, collection, results, e_3;
        if (nResults === void 0) { nResults = 5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    client = getClient();
                    return [4 /*yield*/, client.getCollection({ name: collectionName })];
                case 1:
                    collection = _a.sent();
                    return [4 /*yield*/, collection.query({
                            queryEmbeddings: queryEmbeddings,
                            nResults: nResults,
                        })];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, { success: true, results: results }];
                case 3:
                    e_3 = _a.sent();
                    return [2 /*return*/, { success: false, error: e_3.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
};
var listCollections = function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, collections, e_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                client = getClient();
                return [4 /*yield*/, client.listCollections()];
            case 1:
                collections = _a.sent();
                return [2 /*return*/, { success: true, collections: collections }];
            case 2:
                e_4 = _a.sent();
                return [2 /*return*/, { success: false, error: e_4.message }];
            case 3: return [2 /*return*/];
        }
    });
}); };
var main = function () { return __awaiter(void 0, void 0, void 0, function () {
    var command, result, _a, collectionName, metadata, addCollectionName, addData, queryCollectionName, queryData, e_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                command = process.argv[2];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 12, , 13]);
                result = void 0;
                _a = command;
                switch (_a) {
                    case "create_collection": return [3 /*break*/, 2];
                    case "add_documents": return [3 /*break*/, 4];
                    case "query": return [3 /*break*/, 6];
                    case "list_collections": return [3 /*break*/, 8];
                }
                return [3 /*break*/, 10];
            case 2:
                collectionName = process.argv[3];
                metadata = process.argv[4] ? JSON.parse(process.argv[4]) : undefined;
                return [4 /*yield*/, createCollection(collectionName, metadata)];
            case 3:
                result = _b.sent();
                return [3 /*break*/, 11];
            case 4:
                addCollectionName = process.argv[3];
                addData = JSON.parse(process.argv[4]);
                return [4 /*yield*/, addDocuments(addCollectionName, addData.documents, addData.metadatas, addData.ids, addData.embeddings)];
            case 5:
                result = _b.sent();
                return [3 /*break*/, 11];
            case 6:
                queryCollectionName = process.argv[3];
                queryData = JSON.parse(process.argv[4]);
                return [4 /*yield*/, queryCollection(queryCollectionName, queryData.query_embeddings, queryData.n_results)];
            case 7:
                result = _b.sent();
                return [3 /*break*/, 11];
            case 8: return [4 /*yield*/, listCollections()];
            case 9:
                result = _b.sent();
                return [3 /*break*/, 11];
            case 10:
                result = { success: false, error: "Unknown command: ".concat(command) };
                _b.label = 11;
            case 11:
                console.log(JSON.stringify(result));
                return [3 /*break*/, 13];
            case 12:
                e_5 = _b.sent();
                console.log(JSON.stringify({ success: false, error: e_5.message }));
                process.exit(1);
                return [3 /*break*/, 13];
            case 13: return [2 /*return*/];
        }
    });
}); };
if (require.main === module) {
    main();
}
