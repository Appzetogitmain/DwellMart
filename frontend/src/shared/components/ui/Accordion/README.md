# `<Accordion>` Component

Collapsible panel system supporting `single` or `multiple` expansion modes with smooth spring height transitions.

## Usage

```jsx
import { Accordion } from '../ui';

<Accordion type="single" defaultExpandedId="faq-1">
  <Accordion.Item id="faq-1">
    <Accordion.Header>What is the estimated delivery time?</Accordion.Header>
    <Accordion.Body>Standard delivery takes 3 to 5 business days.</Accordion.Body>
  </Accordion.Item>
  <Accordion.Item id="faq-2">
    <Accordion.Header>How do return requests work?</Accordion.Header>
    <Accordion.Body>Initiate a return from your order history within 7 days.</Accordion.Body>
  </Accordion.Item>
</Accordion>
```
