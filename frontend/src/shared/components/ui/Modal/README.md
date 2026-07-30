# 🚪 Modal Component

The `<Modal>` component provides accessible dialog overlays rendered via React Portals (`createPortal`), supporting focus lock, focus restoration, body scroll locking, and compound subcomponents (`Modal.Header`, `Modal.Body`, `Modal.Footer`, `Modal.Actions`).

## Usage Example

```jsx
import { Modal, Button } from '@/shared/components/ui';

<Modal
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  title="Delete Product"
  variant="danger"
  size="md"
>
  <Modal.Body>
    <p>Are you sure you want to permanently delete this catalog item?</p>
  </Modal.Body>
  <Modal.Footer>
    <Modal.Actions>
      <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
      <Button variant="danger" onClick={handleDelete}>Confirm Delete</Button>
    </Modal.Actions>
  </Modal.Footer>
</Modal>
```
