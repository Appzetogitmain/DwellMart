# 💀 SkeletonLoader Component

The `<SkeletonLoader>` component provides continuous shimmer loading placeholders for cards, text blocks, table rows, avatars, and custom containers.

## Usage Example

```jsx
import { SkeletonLoader } from '@/shared/components/ui';

// Card Preset
<SkeletonLoader variant="card" count={4} />

// Text Rows
<SkeletonLoader variant="text" rows={3} />

// Custom Width & Height
<SkeletonLoader width={240} height={40} rounded="lg" />
```
