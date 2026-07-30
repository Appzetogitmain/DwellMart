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
} from '../index';
import ProductCard from '../../ProductCard';
import { FiShoppingBag, FiSearch, FiMail, FiLock, FiArrowRight, FiFilter, FiSliders, FiBell, FiCheckCircle } from 'react-icons/fi';

const DesignSystemShowcase = () => {
  const { setTheme, activeThemeId, availableThemes } = useTheme();
  const { toast } = useToast();
  
  // Interactive Modal & Drawer states
  const [activeModal, setActiveModal] = useState(null);
  const [activeDrawer, setActiveDrawer] = useState(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    search: '',
    category: '',
    comments: '',
  });

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
