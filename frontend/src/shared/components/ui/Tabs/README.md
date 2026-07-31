# `<Tabs>` Component

Tabbed navigation component supporting `default`, `line`, and `pills` variants with badge count indicators.

## Usage

```jsx
import { Tabs } from '../ui';
import { useState } from 'react';

const [activeTab, setActiveTab] = useState('orders');

<Tabs activeTab={activeTab} onChange={setActiveTab} variant="pills">
  <Tabs.List>
    <Tabs.Tab id="orders" badge={12}>All Orders</Tabs.Tab>
    <Tabs.Tab id="returns" badge={2}>Return Requests</Tabs.Tab>
    <Tabs.Tab id="settings">Settings</Tabs.Tab>
  </Tabs.List>

  <Tabs.Panel id="orders">Orders List...</Tabs.Panel>
  <Tabs.Panel id="returns">Returns List...</Tabs.Panel>
  <Tabs.Panel id="settings">Settings Panel...</Tabs.Panel>
</Tabs>
```
