# ⚠️ Alert Component

The `<Alert>` component provides persistent banners for network notices, validation warnings, and system status updates.

## Usage Example

```jsx
import { Alert, Button } from '@/shared/components/ui';

<Alert
  variant="warning"
  title="Maintenance Notice"
  message="Scheduled catalog maintenance tonight at 12:00 AM UTC."
  dismissible
/>
```
