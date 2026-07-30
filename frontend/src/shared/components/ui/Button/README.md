# 🔘 Button Component

The `<Button>` component is the primary interactive trigger across DwellMart. Driven by design tokens, it supports polymorphic rendering (`as={Link}`), `forwardRef`, micro-interactions, loading spinners, and accessibility focus rings.

## Usage Example

```jsx
import { Button } from '@/shared/components/ui';
import { FiShoppingBag } from 'react-icons/fi';

// Primary CTA
<Button variant="primary" size="md" leftIcon={<FiShoppingBag />}>
  Add to Cart
</Button>

// Link Button
<Button as={Link} to="/shop" variant="secondary">
  Explore Shop
</Button>
```

## Props
- `variant`: `'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'` (default: `'primary'`)
- `size`: `'sm' | 'md' | 'lg'` (default: `'md'`)
- `as`: Polymorphic target element (default: `'button'`)
- `isLoading`: Shows spinner and disables interaction
- `disabled`: Disables interaction and reduces opacity
- `fullWidth`: Expands to fill container width
- `leftIcon` / `rightIcon`: Icon nodes
