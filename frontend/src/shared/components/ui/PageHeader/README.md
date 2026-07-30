# 📌 PageHeader Component

The `<PageHeader>` component standardizes subpage title headers across UserApp, Admin, and Vendor modules. It integrates breadcrumb trails, titles, descriptions, and action CTA slots.

## Usage Example

```jsx
import { PageHeader, Button } from '@/shared/components/ui';

<PageHeader
  title="Manage Products"
  subtitle="View, edit, and organize catalog products."
  breadcrumbs={[
    { label: 'Dashboard', path: '/admin/dashboard' },
    { label: 'Products', active: true },
  ]}
  actions={
    <Button variant="primary" size="md">Add Product</Button>
  }
/>
```
