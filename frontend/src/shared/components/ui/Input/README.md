# 📝 Input Primitive Component

The `<Input>` component handles text entry across DwellMart, including text, password, search, email, number, and phone fields. It includes automatic label binding, error feedback messages, password visibility toggling, and left/right icon support.

## Usage Example

```jsx
import { Input } from '@/shared/components/ui';
import { FiMail, FiLock } from 'react-icons/fi';

// Email Field
<Input
  label="Email Address"
  type="email"
  placeholder="enter@email.com"
  leftIcon={<FiMail />}
  required
/>

// Password Field (with built-in eye toggle)
<Input
  label="Password"
  type="password"
  placeholder="••••••••"
  leftIcon={<FiLock />}
  error={formErrors.password}
/>
```
