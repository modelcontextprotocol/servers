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
exports.getEmbeddings = getEmbeddings;
var dotenv = require("dotenv");
var openai_1 = require("@langchain/openai");
dotenv.config(); // Load environment variables from .env file
var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
console.log("OpenAI API Key status:", OPENAI_API_KEY ? "Set" : "Not set");
var embeddings = new openai_1.OpenAIEmbeddings({
    openAIApiKey: OPENAI_API_KEY,
    modelName: "text-embedding-ada-002", // Changed to older, more widely available model
    maxRetries: 3 // Add retry mechanism
});
// Fallback embedding function using a simple approach
function generateSimpleEmbeddings(text) {
    console.warn("Using fallback embedding method as OPENAI_API_KEY is not set");
    // Create a simple embedding based on word frequencies
    // This is a very basic approach and not as effective as proper embeddings
    var words = text.toLowerCase().split(/\W+/).filter(function (w) { return w.length > 2; });
    var uniqueWords = __spreadArray([], new Set(words), true);
    // Create a vector of 100 dimensions (much smaller than real embeddings)
    var embedding = new Array(100).fill(0);
    // Simple hash function to map words to vector positions
    for (var _i = 0, words_1 = words; _i < words_1.length; _i++) {
        var word = words_1[_i];
        var hashCode = word.split('').reduce(function (acc, char) {
            return (acc * 31 + char.charCodeAt(0)) % 100;
        }, 0);
        embedding[hashCode] += 1;
    }
    // Normalize the vector
    var magnitude = Math.sqrt(embedding.reduce(function (sum, val) { return sum + val * val; }, 0));
    if (magnitude > 0) {
        for (var i = 0; i < embedding.length; i++) {
            embedding[i] = embedding[i] / magnitude;
        }
    }
    return embedding;
}
/**
 * Get embeddings from OpenAI API or fallback to simple method if API key not available
 * @param text The text to embed
 * @returns Array of embedding values
 */
function getEmbeddings(text) {
    return __awaiter(this, void 0, void 0, function () {
        var fallbackEmbeddings, res, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!text || text.trim().length === 0) {
                        console.warn("Empty text provided for embeddings");
                        return [2 /*return*/, []];
                    }
                    console.log("\n=== Embedding Request ===");
                    console.log("Input text:", text);
                    console.log("OpenAI API Key:", OPENAI_API_KEY ? "Present" : "Missing");
                    // Check OpenAI_API_KEY value right before fallback check
                    console.log("Value of OPENAI_API_KEY before fallback check:", OPENAI_API_KEY);
                    // If no API key is set, use the fallback method
                    if (!OPENAI_API_KEY) {
                        console.log("OpenAI API key IS NOT SET. Using fallback embeddings."); // More explicit log
                        fallbackEmbeddings = generateSimpleEmbeddings(text);
                        console.log("Generated fallback embeddings with length:", fallbackEmbeddings.length);
                        return [2 /*return*/, fallbackEmbeddings];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    console.log("Calling OpenAI API for embeddings using model: text-embedding-ada-002");
                    return [4 /*yield*/, embeddings.embedQuery(text)];
                case 2:
                    res = _c.sent();
                    console.log("Successfully received embeddings from OpenAI API"); // Added success log
                    console.log("Embeddings vector length:", res.length);
                    console.log("First few values:", res.slice(0, 5));
                    return [2 /*return*/, res];
                case 3:
                    error_1 = _c.sent();
                    console.error("Error getting embeddings from OpenAI:", error_1);
                    console.warn("Falling back to simple embeddings due to OpenAI error: ".concat(error_1.message)); // Modified fallback log
                    if (((_a = error_1 === null || error_1 === void 0 ? void 0 : error_1.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                        console.error("Authentication error. Check your OpenAI API key.");
                    }
                    else if (((_b = error_1 === null || error_1 === void 0 ? void 0 : error_1.response) === null || _b === void 0 ? void 0 : _b.status) === 429) {
                        console.error("Rate limit exceeded. Please try again later.");
                    }
                    else {
                        console.error("Unknown error occurred:", error_1.message);
                    }
                    return [2 /*return*/, generateSimpleEmbeddings(text)];
                case 4: return [2 /*return*/];
            }
        });
    });
}
