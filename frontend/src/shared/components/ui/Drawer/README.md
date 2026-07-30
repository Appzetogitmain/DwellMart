# 🚪 Drawer Component

The `<Drawer>` component provides slide-out sidebar panels and mobile bottom sheets rendered via React Portals (`createPortal`). It supports semantic presets (`cart`, `filter`, `navigation`, `settings`) and positions (`right`, `left`, `bottom`, `top`).

## Usage Example

```jsx
import { Drawer, Button } from '@/shared/components/ui';

<Drawer
  isOpen={isCartOpen}
  onClose={() => setIsCartOpen(false)}
  title="Your Shopping Cart"
  position="right"
  size="cart"
>
  <Drawer.Body>
    <p>Cart items list...</p>
  </Drawer.Body>
  <Drawer.Footer>
    <Button variant="primary" fullWidth>Checkout Now</Button>
  </Drawer.Footer>
</Drawer>
```
