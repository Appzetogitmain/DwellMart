# `<Pagination>` Component

Accessible data table page selector supporting smart page number array generation (`1 ... 4 5 6 ... 10`), previous/next navigation buttons, and page size changer options.

## Usage

```jsx
import { Pagination } from '../ui';
import { useState } from 'react';

const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(10);

<Pagination
  currentPage={page}
  totalPages={12}
  totalItems={120}
  pageSize={pageSize}
  onPageChange={setPage}
  onPageSizeChange={setPageSize}
  showSizeChanger
/>
```
