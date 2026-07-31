import { useState } from 'react';
import { useTheme } from '../../../../theme';
import {
  Button,
  Input,
  Select,
  TextArea,
  Badge,
  Card,
  Breadcrumb,
  PageHeader,
  Modal,
  Drawer,
  Spinner,
  SkeletonLoader,
  EmptyState,
  Alert,
  useToast,
  Dropdown,
  Accordion,
  Tabs,
  Pagination,
  Checkbox,
  Radio,
  Switch,
  Avatar,
  Chip,
  Rating,
  Tooltip,
  QuantitySelector,
} from '../index';
import ProductCard from '../../ProductCard';
import { FiShoppingBag, FiSearch, FiMail, FiLock, FiArrowRight, FiFilter, FiSliders, FiBell, FiCheckCircle } from 'react-icons/fi';

const DesignSystemShowcase = () => {
  const { setTheme, activeThemeId, availableThemes } = useTheme();
  const { toast } = useToast();
  
  // Interactive Modal & Drawer states
  const [activeModal, setActiveModal] = useState(null);
  const [activeDrawer, setActiveDrawer] = useState(null);

  // Phase 2D Navigation State
  const [demoTab, setDemoTab] = useState('overview');
  const [demoPage, setDemoPage] = useState(1);
  const [demoPageSize, setDemoPageSize] = useState(10);

  // Phase 2E Utility State
  const [demoChecked, setDemoChecked] = useState(true);
  const [demoRadioVal, setDemoRadioVal] = useState('express');
  const [demoSwitchVal, setDemoSwitchVal] = useState(true);
  const [demoRatingVal, setDemoRatingVal] = useState(4.5);
  const [demoQty, setDemoQty] = useState(2);

  return (
    <div className="min-h-screen bg-surface-background text-textColor-primary p-4 sm:p-8 max-w-[1600px] mx-auto space-y-12 transition-colors duration-300">
      
      {/* Header & Theme Control Toolbar */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-surface-card rounded-card border border-borderToken-default shadow-card">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Enterprise Design System Showcase</h1>
          <p className="text-textColor-secondary text-sm mt-1">
            Interactive QA environment for Phase 2A, 2B & 2C Components across all supported themes.
          </p>
        </div>

        {/* Dynamic Theme Switcher Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-textColor-muted">Active Theme:</span>
          {availableThemes.map((themeId) => (
            <Button
              key={themeId}
              size="sm"
              variant={activeThemeId === themeId ? 'primary' : 'secondary'}
              onClick={() => setTheme(themeId)}
            >
              {themeId.toUpperCase()}
            </Button>
          ))}
        </div>
      </header>

      {/* ==================== CATEGORY 1: FEEDBACK SYSTEMS (PHASE 2C) ==================== */}
      <section className="space-y-6">
        <div className="border-b border-borderToken-default pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">⚡ 1. Feedback Systems (Phase 2C)</h2>
            <p className="text-sm text-textColor-muted">Spinners, skeleton shimmers, 7 empty state presets, alert banners & toast provider</p>
          </div>
          <Badge variant="gold">Phase 2C</Badge>
        </div>

        {/* Toast Notification Provider Triggers */}
        <Card variant="default" padding="lg">
          <Card.Header>
            <h3 className="font-bold text-base flex items-center gap-2">
              <FiBell className="text-brand-primary" />
              useToast() Notification Triggers
            </h3>
          </Card.Header>
          <Card.Body className="space-y-3">
            <p className="text-xs text-textColor-muted">Stacking toast notifications with auto-dismiss timers, hover pause, and ARIA live accessibility.</p>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" variant="primary" onClick={() => toast.success('Product saved to wishlist!', 'Wishlist Updated')}>
                Trigger Success Toast
              </Button>
              <Button size="sm" variant="danger" onClick={() => toast.error('Payment transaction failed. Please retry.', 'Payment Error')}>
                Trigger Error Toast
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toast.warning('Low inventory stock warning.', 'Inventory Alert')}>
                Trigger Warning Toast
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast.info('System updates complete.', 'Notice')}>
                Trigger Info Toast
              </Button>
            </div>
          </Card.Body>
        </Card>

        {/* Spinners & Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Spinners */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Spinner Sizes & Inline Modes</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
                <Spinner size="xl" />
              </div>
              <div className="flex items-center gap-3">
                <Button isLoading variant="primary" size="sm">Loading Action</Button>
                <Spinner size="sm" showLabel label="Fetching data..." inline />
              </div>
            </Card.Body>
          </Card>

          {/* Persistent Alert Banners */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Persistent Alert Banners</h3>
            </Card.Header>
            <Card.Body className="space-y-3">
              <Alert variant="info" title="System Notice" message="Catalog sync scheduled for tonight." dismissible />
              <Alert variant="warning" title="Warning" message="Your seller document expires in 3 days." />
              <Alert variant="error" title="Critical Error" message="Backend API request failed." dismissible />
              <Alert variant="success" title="Success" message="Your subscription has been renewed." />
            </Card.Body>
          </Card>
        </div>

        {/* Skeleton Loaders & Empty States */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Skeleton Loaders */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Skeleton Loader Shimmer Presets</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <SkeletonLoader variant="text" rows={3} />
              <div className="flex items-center gap-3">
                <SkeletonLoader variant="avatar" width={48} height={48} />
                <div className="space-y-2 flex-1">
                  <SkeletonLoader width="60%" height={14} />
                  <SkeletonLoader width="40%" height={10} />
                </div>
              </div>
              <SkeletonLoader width="100%" height={80} rounded="card" />
            </Card.Body>
          </Card>

          {/* EmptyState Presets */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">EmptyState Preset Showcase</h3>
            </Card.Header>
            <Card.Body>
              <EmptyState
                variant="no-results"
                title="No Matching Items"
                description="Try adjusting your filter selection."
                action={<Button size="sm" variant="primary">Clear Search</Button>}
              />
            </Card.Body>
          </Card>
        </div>
      </section>

      {/* ==================== CATEGORY 2: LAYOUT & DIALOG SYSTEMS (PHASE 2B) ==================== */}
      <section className="space-y-6">
        <div className="border-b border-borderToken-default pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">🏛️ 2. Layout & Dialog Systems (Phase 2B)</h2>
            <p className="text-sm text-textColor-muted">React Portals, focus trapping, breadcrumb truncation, page headers, modals & drawers</p>
          </div>
          <Badge variant="verified">Phase 2B</Badge>
        </div>

        {/* Modal & Drawer Launchers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Modal Triggers</h3>
            </Card.Header>
            <Card.Body className="flex flex-wrap gap-2.5">
              <Button size="sm" variant="primary" onClick={() => setActiveModal('default')}>Default Modal</Button>
              <Button size="sm" variant="danger" onClick={() => setActiveModal('danger')}>Delete Item</Button>
            </Card.Body>
          </Card>

          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Drawer Triggers</h3>
            </Card.Header>
            <Card.Body className="flex flex-wrap gap-2.5">
              <Button size="sm" variant="primary" leftIcon={<FiShoppingBag />} onClick={() => setActiveDrawer('cart')}>Cart Drawer (420px)</Button>
              <Button size="sm" variant="secondary" leftIcon={<FiFilter />} onClick={() => setActiveDrawer('filter')}>Filter Drawer (380px)</Button>
            </Card.Body>
          </Card>
        </div>
      </section>

      {/* ==================== CATEGORY 3: DOMAIN COMPONENT VARIANTS ==================== */}
      <section className="space-y-6">
        <div className="border-b border-borderToken-default pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">🛒 3. Domain ProductCard Variants</h2>
            <p className="text-sm text-textColor-muted">Standard Marketplace Card vs Premium Gold & Obsidian Hero Card</p>
          </div>
          <Badge variant="gold">Domain</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          <div>
            <span className="block text-xs font-bold uppercase text-textColor-muted mb-2">Default Variant:</span>
            <ProductCard
              product={{
                id: 'demo-1',
                name: 'Modern Ergonomic Chair',
                unit: '1 Piece',
                price: 1499,
                originalPrice: 1999,
                rating: 4.8,
                reviewCount: 42,
                image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=400',
              }}
              variant="default"
            />
          </div>

          <div>
            <span className="block text-xs font-bold uppercase text-textColor-muted mb-2">Premium Gold & Obsidian Variant:</span>
            <ProductCard
              product={{
                id: 'demo-2',
                name: 'Luxury Velvet Sofa Set',
                unit: '3 Seater',
                price: 12999,
                originalPrice: 16999,
                rating: 4.9,
                reviewCount: 88,
                image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400',
              }}
              variant="premium"
            />
          </div>

          <div>
            <span className="block text-xs font-bold uppercase text-textColor-muted mb-2">Minimal Bordered Variant:</span>
            <ProductCard
              product={{
                id: 'demo-3',
                name: 'Minimalist Wooden Desk',
                unit: 'Solid Oak',
                price: 3499,
                originalPrice: 4299,
                rating: 4.6,
                reviewCount: 19,
                image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=400',
              }}
              variant="minimal"
            />
          </div>
        </div>
      </section>

      {/* ==================== CATEGORY 4: NAVIGATION COMPONENTS (PHASE 2D) ==================== */}
      <section className="space-y-6">
        <div className="border-b border-borderToken-default pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">🧭 4. Navigation Components (Phase 2D)</h2>
            <p className="text-sm text-textColor-muted">Dropdown popovers, collapsible accordions, tabbed panels, and pagination</p>
          </div>
          <Badge variant="gold">Phase 2D</Badge>
        </div>

        {/* Dropdowns & Accordion */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Dropdown Menu Popovers */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Dropdown Menu Popover</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <p className="text-xs text-textColor-muted">Supports click-outside listener, position placement, and keyboard navigation.</p>
              <div className="flex items-center gap-4 flex-wrap">
                <Dropdown trigger={<Button variant="outline" size="sm">User Menu (Bottom Left)</Button>} position="bottom-left">
                  <Dropdown.Header>Account Settings</Dropdown.Header>
                  <Dropdown.Item icon={<FiShoppingBag />}>My Orders</Dropdown.Item>
                  <Dropdown.Item icon={<FiSliders />}>Preferences</Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item danger>Log Out</Dropdown.Item>
                </Dropdown>

                <Dropdown trigger={<Button variant="primary" size="sm">Actions (Bottom Right)</Button>} position="bottom-right">
                  <Dropdown.Header>Admin Controls</Dropdown.Header>
                  <Dropdown.Item>Edit Catalog</Dropdown.Item>
                  <Dropdown.Item>Export CSV</Dropdown.Item>
                </Dropdown>
              </div>
            </Card.Body>
          </Card>

          {/* Accordion Panels */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Collapsible Accordion</h3>
            </Card.Header>
            <Card.Body>
              <Accordion type="single" defaultExpandedId="faq-1">
                <Accordion.Item id="faq-1">
                  <Accordion.Header>What is the return policy?</Accordion.Header>
                  <Accordion.Body>Returns are accepted within 7 days of delivery with original packaging intact.</Accordion.Body>
                </Accordion.Item>
                <Accordion.Item id="faq-2">
                  <Accordion.Header>Do you offer free shipping?</Accordion.Header>
                  <Accordion.Body>Free express shipping is applied on all orders above ₹999.</Accordion.Body>
                </Accordion.Item>
              </Accordion>
            </Card.Body>
          </Card>
        </div>

        {/* Tabs & Pagination */}
        <div className="grid grid-cols-1 gap-6">
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Tabbed Panels (Pills Variant)</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <Tabs activeTab={demoTab} onChange={setDemoTab} variant="pills">
                <Tabs.List>
                  <Tabs.Tab id="overview" badge="Live">Store Overview</Tabs.Tab>
                  <Tabs.Tab id="orders" badge={18}>Active Orders</Tabs.Tab>
                  <Tabs.Tab id="analytics">Analytics Report</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel id="overview">
                  <p className="text-xs text-textColor-secondary">Store overview summary metrics and high-level inventory distribution.</p>
                </Tabs.Panel>
                <Tabs.Panel id="orders">
                  <p className="text-xs text-textColor-secondary">18 active fulfillment orders currently being processed by logistics providers.</p>
                </Tabs.Panel>
                <Tabs.Panel id="analytics">
                  <p className="text-xs text-textColor-secondary">Sales performance and customer retention funnel reports.</p>
                </Tabs.Panel>
              </Tabs>

              {/* Interactive Pagination */}
              <div className="pt-4 border-t border-borderToken-default">
                <span className="block text-xs font-bold uppercase text-textColor-muted mb-2">Accessible Pagination:</span>
                <Pagination
                  currentPage={demoPage}
                  totalPages={12}
                  totalItems={120}
                  pageSize={demoPageSize}
                  onPageChange={setDemoPage}
                  onPageSizeChange={setDemoPageSize}
                  showSizeChanger
                />
              </div>
            </Card.Body>
          </Card>
        </div>
      </section>

      {/* ==================== CATEGORY 5: UTILITY PRIMITIVES (PHASE 2E) ==================== */}
      <section className="space-y-6">
        <div className="border-b border-borderToken-default pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">🛠️ 5. Utility Primitives (Phase 2E)</h2>
            <p className="text-sm text-textColor-muted">Form controls, avatar status badges, chips, ratings, portal tooltips, & quantity selectors</p>
          </div>
          <Badge variant="gold">Phase 2E</Badge>
        </div>

        {/* Form Controls & Switches */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Checkbox & Indeterminate</h3>
            </Card.Header>
            <Card.Body className="space-y-3">
              <Checkbox
                checked={demoChecked}
                onChange={(e) => setDemoChecked(e.target.checked)}
                label="Enable express delivery"
                description="Orders delivered within 2 hours"
              />
              <Checkbox
                indeterminate
                label="Select All Items (Indeterminate)"
                description="Used for table select-all controls"
              />
            </Card.Body>
          </Card>

          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Radio Controls</h3>
            </Card.Header>
            <Card.Body className="space-y-3">
              <Radio
                checked={demoRadioVal === 'standard'}
                value="standard"
                onChange={() => setDemoRadioVal('standard')}
                label="Standard Shipping"
                description="Delivered in 3-5 business days"
              />
              <Radio
                checked={demoRadioVal === 'express'}
                value="express"
                onChange={() => setDemoRadioVal('express')}
                label="Express Shipping (Gold)"
                description="Delivered next business morning"
              />
            </Card.Body>
          </Card>

          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Motion Toggle Switches</h3>
            </Card.Header>
            <Card.Body className="space-y-3">
              <Switch
                checked={demoSwitchVal}
                onChange={(e) => setDemoSwitchVal(e.target.checked)}
                label="Email Notifications"
                description="Receive daily order updates"
              />
              <Switch
                checked={false}
                disabled
                label="Dark Mode Lock"
                description="System managed theme control"
              />
            </Card.Body>
          </Card>
        </div>

        {/* Avatars, Chips, Ratings, Tooltips & QuantitySelectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Avatars & Avatar.Group */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Avatar & Avatar.Group</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Avatar name="Furqan Uddin" size="sm" status="online" />
                <Avatar name="Nansi Khushi" size="md" status="away" />
                <Avatar name="Alex Smith" size="lg" isVerified />
                <Avatar name="Vendor Store" size="xl" status="busy" />
              </div>

              <div>
                <span className="block text-xs font-bold uppercase text-textColor-muted mb-2">Avatar Group (+Overflow):</span>
                <Avatar.Group max={3} size="md">
                  <Avatar name="Furqan Uddin" />
                  <Avatar name="Nansi Khushi" />
                  <Avatar name="Alex Smith" />
                  <Avatar name="John Doe" />
                  <Avatar name="Sarah Connor" />
                </Avatar.Group>
              </div>
            </Card.Body>
          </Card>

          {/* Chips & Tag Presets */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Semantic Chips & Filter Tags</h3>
            </Card.Header>
            <Card.Body className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Chip variant="gold">Obsidian Gold</Chip>
                <Chip variant="primary">Primary Tag</Chip>
                <Chip variant="success">Completed</Chip>
                <Chip variant="warning">Pending</Chip>
                <Chip variant="error">Cancelled</Chip>
                <Chip variant="info">System Info</Chip>
                <Chip variant="filter" onRemove={() => toast.info('Category filter removed')}>Category: Furniture</Chip>
              </div>
            </Card.Body>
          </Card>

          {/* Star Rating Controls */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Star Rating (Interactive & ReadOnly)</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <div>
                <span className="block text-xs font-bold text-textColor-muted mb-1">Interactive Rating Input:</span>
                <Rating value={demoRatingVal} onChange={setDemoRatingVal} size="lg" showValue />
              </div>
              <div>
                <span className="block text-xs font-bold text-textColor-muted mb-1">ReadOnly Half Star (4.5 Stars):</span>
                <Rating value={4.5} readOnly size="md" showValue />
              </div>
            </Card.Body>
          </Card>

          {/* Tooltips & QuantitySelector */}
          <Card variant="default">
            <Card.Header>
              <h3 className="font-bold text-base">Portal Tooltips & Quantity Selector</h3>
            </Card.Header>
            <Card.Body className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Tooltip content="Adds item to shopping cart" placement="top">
                  <Button size="sm" variant="outline">Hover Top Tooltip</Button>
                </Tooltip>
                <Tooltip content="Detailed product specs" placement="right" trigger="hover">
                  <Button size="sm" variant="secondary">Hover Right Tooltip</Button>
                </Tooltip>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase text-textColor-muted mb-2">E-Commerce QuantitySelector:</span>
                <div className="flex items-center gap-4 flex-wrap">
                  <QuantitySelector value={demoQty} onChange={setDemoQty} min={1} max={10} step={1} />
                  <QuantitySelector value={1} min={1} max={5} isOutOfStock />
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>
      </section>

      {/* INTERACTIVE MODAL & DRAWER DIALOGS */}
      <Modal
        isOpen={!!activeModal}
        onClose={() => setActiveModal(null)}
        title="Interactive Dialog Modal"
        variant={activeModal || 'default'}
        size="md"
      >
        <Modal.Body>
          <p className="text-sm text-textColor-secondary">
            Renders cleanly outside normal DOM hierarchy using React Portal with focus trap & ESC listeners.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setActiveModal(null)}>Close</Button>
        </Modal.Footer>
      </Modal>

      <Drawer
        isOpen={!!activeDrawer}
        onClose={() => setActiveDrawer(null)}
        title="Slide-out Drawer Panel"
        size={activeDrawer || 'md'}
      >
        <Drawer.Body>
          <p className="text-sm text-textColor-secondary">
            Slide-out drawer panel with semantic width preset.
          </p>
        </Drawer.Body>
        <Drawer.Footer>
          <Button variant="primary" fullWidth onClick={() => setActiveDrawer(null)}>Close Drawer</Button>
        </Drawer.Footer>
      </Drawer>

    </div>
  );
};

export default DesignSystemShowcase;
