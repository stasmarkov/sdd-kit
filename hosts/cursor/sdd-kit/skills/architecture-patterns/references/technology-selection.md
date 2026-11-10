# Technology Selection Reference

Comparison matrices and decision trees for high-load system design. Used by the `api-architect` agent when recommending infrastructure for real-time, async, search, vector, caching, graph, and observability needs.

## Technology Matrix

### Real-Time Technologies

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **Framework-native WebSocket server** | Presence channels inside the app's own framework | Simple setup, scales with the framework |
| **Socket.io** | Cross-platform real-time, fallbacks | More features, more complexity |
| **Server-Sent Events** | One-way server-to-client updates | Simple, no bidirectional |
| **WebRTC** | Peer-to-peer, video/audio | Complex, requires STUN/TURN |
| **Pusher/Ably** | Managed WebSocket service | Zero ops, usage-based cost |

### Queue & Background Processing

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **Framework job queue + Redis** | Standard application jobs | Built-in, simple, good for most cases |
| **Queue dashboard** | Redis queue monitoring/management | Dashboard, metrics, fine control |
| **RabbitMQ** | Complex routing, guaranteed delivery | More ops, more features |
| **Amazon SQS** | AWS native, serverless | Managed, scales infinitely |
| **Kafka** | High-throughput event streaming | Complex, for 100K+ events/sec |
| **Bull/BullMQ** | Node.js job queues | If frontend needs job processing |

### Search Technologies

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **Meilisearch** | Simple full-text, typo tolerant | Easy setup, limited features |
| **Elasticsearch** | Complex search, analytics | Powerful, resource intensive |
| **Algolia** | Managed search as service | Fast, usage-based pricing |
| **Typesense** | Open-source Algolia alternative | Good balance of features |
| **Solr** | Enterprise search | Legacy but stable |
| **PostgreSQL Full-Text** | Simple search needs | No extra infrastructure |

### Vector & AI/ML

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **pgvector** | PostgreSQL vector search | Simple, use existing DB |
| **Pinecone** | Managed vector database | Easy, usage-based |
| **Weaviate** | Open-source vector DB | Self-hosted, flexible |
| **Qdrant** | High-performance vectors | Fast, good filtering |
| **Milvus** | Large-scale vectors | Enterprise grade |
| **ChromaDB** | Development/prototyping | Simple Python API |

### Caching Strategies

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **Redis** | Sessions, cache, queues | Swiss army knife |
| **Memcached** | Simple key-value cache | Less features, very fast |
| **Cloudflare/Fastly** | Edge caching, CDN | Global, managed |
| **Varnish** | HTTP cache layer | Complex, powerful |
| **Framework cache layer** | Application-level | Use existing infrastructure |

### Graph & Relationships

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **Neo4j** | Complex relationship queries | Full graph database |
| **Amazon Neptune** | Managed graph DB | AWS native |
| **ArangoDB** | Multi-model (graph + doc) | Versatile |
| **DGraph** | Distributed graph | GraphQL native |
| **PostgreSQL + Recursive CTEs** | Simple graphs | Use existing DB |

### Monitoring & Observability

| Technology | Best For | Considerations |
|------------|----------|----------------|
| **Datadog** | Full-stack monitoring | Expensive, comprehensive |
| **New Relic** | APM, error tracking | Check the framework's integration |
| **Sentry** | Error tracking | Focus on errors |
| **Prometheus + Grafana** | Self-hosted metrics | Free, more ops |
| **Framework debug dashboard** | Development debugging | Dev only |
| **Elastic APM** | If already using ELK | Good integration |


## Decision Trees

### Real-Time Feature Decision Tree

```
Need real-time updates?
├── Server → Client only?
│   ├── Simple updates → Server-Sent Events
│   └── Complex updates → WebSockets
├── Bidirectional?
│   ├── Framework-native option exists → use it
│   ├── Cross-platform → Socket.io
│   └── Managed → Pusher/Ably
└── Peer-to-peer?
    └── Video/Audio → WebRTC
```

### Search Decision Tree

```
Need search functionality?
├── Simple text search?
│   ├── PostgreSQL available → pg_trgm + full-text
│   └── MySQL → Consider Meilisearch
├── Complex search (facets, analytics)?
│   ├── Budget for managed → Algolia
│   └── Self-hosted → Elasticsearch or Typesense
├── Vector/semantic search?
│   ├── PostgreSQL available → pgvector
│   ├── Managed preference → Pinecone
│   └── Self-hosted → Weaviate or Qdrant
└── Hybrid (text + vector)?
    └── Weaviate or Elasticsearch 8+
```

### Async Processing Decision Tree

```
Need background processing?
├── Standard jobs (emails, reports)?
│   └── Framework job queue + Redis + dashboard
├── Complex routing?
│   └── RabbitMQ
├── High-throughput events?
│   ├── < 10K/sec → Redis Streams
│   └── > 10K/sec → Kafka
├── Event sourcing?
│   └── Kafka + event store
└── Managed/serverless?
    └── AWS SQS + Lambda
```

## Common Architecture Shapes

### Event-Driven Architecture

```
User Action
    ↓
API Controller
    ↓
Service (dispatches event)
    ↓
Event Dispatcher
    ├── Immediate Listener (sync)
    └── Queued Listener (async)
            ↓
        Job Queue (Redis)
            ↓
        Worker Process
            ↓
        External Service / Database / Notification
```

### CQRS (Command Query Responsibility Segregation)

```
Write Path (Commands)              Read Path (Queries)
     ↓                                  ↓
Command Handler                    Query Handler
     ↓                                  ↓
Domain Model                       Read Model
     ↓                                  ↓
Event Store                        Denormalized DB / Cache
     ↓
Projections → Read Model
```

### Microservices Communication

```
                    ┌─────────────────┐
                    │   API Gateway   │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
    │ Service │        │ Service │        │ Service │
    │    A    │◄──────►│    B    │◄──────►│    C    │
    └────┬────┘        └────┬────┘        └────┬────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Message Broker │
                    │   (RabbitMQ)    │
                    └─────────────────┘
```
