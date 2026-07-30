# 🍞 Breadcrumb Component

The `<Breadcrumb>` component provides accessible trail navigation across subpages with automatic truncation (`maxItems`).

## Usage Example

```jsx
import { Breadcrumb } from '@/shared/components/ui';

<Breadcrumb
  items={[
    { label: 'Shop', path: '/shop' },
    { label: 'Electronics', path: '/category/electronics' },
    { label: 'Smartphones', active: true },
  ]}
  maxItems={4}
/>
```
