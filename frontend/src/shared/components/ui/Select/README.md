# 🔽 Select Component

The `<Select>` component provides dropdown selection across DwellMart, driven by design tokens and accessible focus states.

## Usage Example

```jsx
import { Select } from '@/shared/components/ui';

<Select
  label="Category"
  placeholder="Choose a category"
  options={[
    { label: 'Electronics', value: 'electronics' },
    { label: 'Fashion', value: 'fashion' },
  ]}
  value={selectedCategory}
  onChange={(e) => setSelectedCategory(e.target.value)}
/>
```
