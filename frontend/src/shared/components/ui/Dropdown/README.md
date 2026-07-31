# `<Dropdown>` Component

Accessible menu popover component supporting trigger, positioning, click-outside dismissal, and keyboard handlers.

## Usage

```jsx
import { Dropdown, Button } from '../ui';
import { FiUser, FiSettings, FiLogOut } from 'react-icons/fi';

<Dropdown trigger={<Button variant="outline">My Account</Button>} position="bottom-right">
  <Dropdown.Header>User Account</Dropdown.Header>
  <Dropdown.Item icon={<FiUser />}>Profile Settings</Dropdown.Item>
  <Dropdown.Item icon={<FiSettings />}>Store Preferences</Dropdown.Item>
  <Dropdown.Divider />
  <Dropdown.Item danger icon={<FiLogOut />}>Logout</Dropdown.Item>
</Dropdown>
```
