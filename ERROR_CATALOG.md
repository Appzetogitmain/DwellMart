# DwellMart System Error Catalog & Notification Standard

A single source of truth for error contracts, backend error codes, HTTP status mappings, and user-facing notification policies across all DwellMart services (Backend API, UserApp, Admin, Vendor, Delivery).

---

## 1. System Error Code Catalog & Severity Classifications

| Error Code | HTTP Status | Error Type Category | Severity Level | User-Facing Title | Default User Message | Retry Action Metadata |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **`AUTH_REQUIRED`** | **401** | `AUTH_ERROR` | `WARNING` | Session Expired | Please login again to continue. | `{ retryable: true, action: 'Login' }` |
| **`INVALID_TOKEN`** | **401** | `AUTH_ERROR` | `WARNING` | Session Expired | Please login again to continue. | `{ retryable: true, action: 'Login' }` |
| **`PERMISSION_DENIED`** | **403** | `PERMISSION_ERROR` | `ERROR` | Access Denied | You don't have permission to perform this action. | `{ retryable: false }` |
| **`RESOURCE_NOT_FOUND`** | **404** | `BUSINESS_ERROR` | `INFO` | Not Found | The requested resource was not found. | `{ retryable: false }` |
| **`DUPLICATE_RESOURCE`** | **409** | `BUSINESS_ERROR` | `WARNING` | Already Exists | This record already exists. | `{ retryable: false }` |
| **`VALIDATION_ERROR`** | **400** | `VALIDATION_ERROR` | `WARNING` | Validation Error | Please review the highlighted fields and try again. | `{ retryable: false }` |
| **`OUT_OF_STOCK`** | **400** | `BUSINESS_ERROR` | `WARNING` | Stock Limit | Item is currently out of stock. | `{ retryable: false }` |
| **`COUPON_EXPIRED`** | **400** | `BUSINESS_ERROR` | `INFO` | Coupon Expired | This coupon code has expired. | `{ retryable: false }` |
| **`INSUFFICIENT_FUNDS`** | **400** | `BUSINESS_ERROR` | `WARNING` | Insufficient Balance | Insufficient wallet balance for this transaction. | `{ retryable: false }` |
| **`RATE_LIMITED`** | **429** | `BUSINESS_ERROR` | `WARNING` | Too Many Requests | Too many requests. Please wait a moment and try again. | `{ retryable: true, retryAfter: 5, action: 'Retry' }` |
| **`SERVER_ERROR`** | **500** | `SERVER_ERROR` | `CRITICAL` | Server Error | Something went wrong on our end. Please try again later. | `{ retryable: true, action: 'Retry' }` |

---

## 2. Unhandled Exception & Network Mappings (Client Fallback)

| Trigger Condition | Error Category | Severity Level | User-Facing Title | User Message | Retry Metadata |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **Browser Offline / Disconnected** | `NETWORK_ERROR` | `ERROR` | Connection Problem | `Unable to connect. Please check your internet connection.` | `{ retryable: true, action: 'Retry' }` |
| **Request Timeout (`ECONNABORTED`)** | `NETWORK_ERROR` | `ERROR` | Request Timeout | `Request timed out. Please try again.` | `{ retryable: true, action: 'Retry' }` |
| **Unhandled Technical Leak (`TypeError`, `ReferenceError`, Mongoose)** | `SERVER_ERROR` | `CRITICAL` | Unexpected Error | `Something unexpected happened. Please try again later.` | `{ retryable: true, action: 'Retry' }` |

---

## 3. Correlation ID Middleware & Standardized Response Payload

Every request passing through `app.use(requestIdMiddleware)` receives an explicit trace `requestId` and response header `X-Request-ID`.

All backend controllers and middleware pass errors through [errorHandler.js](file:///d:/Appzeto_Projects/DwellMart/backend/src/middlewares/errorHandler.js). Responses strictly conform to:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "Something went wrong on our end. Please try again later.",
  "requestId": "8f93b0d1",
  "timestamp": "2026-08-01T05:18:00.000Z",
  "errors": []
}
```

### Security & Privacy Guarantees
1. **0 Raw Leakage**: Stack traces, node internal errors, database queries, and raw JavaScript exceptions are **never** returned in production API responses.
2. **Developer Traceability**: Every request generates a unique `requestId` printed to the server terminal console along with the full stack trace for instant developer correlation.
3. **Dev Mode Expander**: In development (`NODE_ENV === 'development'`), responses include a `debug` payload for instant frontend debugging without inspecting server terminal logs.

---

## 4. Frontend Architecture, Queue & Deduplication

```
                  ┌──────────────────────────────────────────┐
                  │              Axios Interceptor           │
                  └────────────────────┬─────────────────────┘
                                       │ Checks config.silent & _toastShown
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │          getUserFriendlyError()          │
                  └────────────────────┬─────────────────────┘
                                       │ Translates code -> { type, severity, title, message, retry }
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │          toastService Abstraction        │
                  └────────────────────┬─────────────────────┘
                                       │ Queue (Max 3) & Deduplicates (2.5s timer)
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │             Design System UI             │
                  └──────────────────────────────────────────┘
```

- **Silent API Calls**: Add `{ silent: true }` to request config for background polling, search, or heartbeat requests.
- **Double-Toast Protection**: Interceptor sets `error._toastShown = true` so component `.catch()` blocks do not trigger duplicate notifications.
- **Queue Management**: Toast service caps maximum visible toasts to 3 to prevent screen clutter during cascading errors.
- **Single Import**: All components and stores import `toastService` from `@shared/utils/toastService`.
