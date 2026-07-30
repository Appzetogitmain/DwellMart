# 🍞 Toast System

The Toast system provides transient, auto-dismissing popover notifications backed by a `<ToastProvider>` and `useToast()` hook.

## Usage Example

```jsx
import { useToast } from '@/shared/components/ui';

const MyComponent = () => {
  const { toast } = useToast();

  const handleSave = () => {
    toast.success('Product saved to wishlist!');
  };
};
```
