# 📭 EmptyState Component

The `<EmptyState>` component provides graphic placeholders for empty catalog views, empty shopping carts, offline states, and missing search results.

## Usage Example

```jsx
import { EmptyState, Button } from '@/shared/components/ui';

<EmptyState
  variant="no-results"
  title="No Products Found"
  description="Try adjusting your filters or search keywords."
  action={<Button variant="primary">Reset Filters</Button>}
/>
```
