# 📄 TextArea Component

The `<TextArea>` component provides multi-line text input for descriptions, support messages, product reviews, and address details across DwellMart.

## Usage Example

```jsx
import { TextArea } from '@/shared/components/ui';

<TextArea
  label="Product Description"
  placeholder="Enter product features and details..."
  rows={5}
  maxLength={500}
  showCharCount
  value={description}
  onChange={(e) => setDescription(e.target.value)}
/>
```
