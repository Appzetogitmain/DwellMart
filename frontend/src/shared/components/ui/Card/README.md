# 🃏 Card Component

The `<Card>` component is a surface container for product cards, vendor showcases, statistics cards, and settings panels across DwellMart. It supports compound sub-components (`Card.Header`, `Card.Body`, `Card.Footer`, `Card.Actions`) and polymorphic target elements (`as="section"`).

## Usage Example

```jsx
import { Card, Button, Badge } from '@/shared/components/ui';

<Card hoverable variant="default">
  <Card.Header>
    <h3 className="font-bold text-lg">Featured Vendor</h3>
    <Badge variant="verified">Verified</Badge>
  </Card.Header>
  <Card.Body>
    <p className="text-sm text-slate-600">Curated products from top sellers nationwide.</p>
  </Card.Body>
  <Card.Actions>
    <Button variant="outline" size="sm">View Store</Button>
  </Card.Actions>
</Card>
```
