import React, { useState, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown } from 'react-icons/fi';

const AccordionContext = createContext(null);

export const Accordion = ({
  children,
  type = 'single',
  defaultExpandedId = null,
  className = '',
}) => {
  const [expandedIds, setExpandedIds] = useState(() => {
    if (!defaultExpandedId) return type === 'multiple' ? [] : null;
    return type === 'multiple'
      ? Array.isArray(defaultExpandedId) ? defaultExpandedId : [defaultExpandedId]
      : defaultExpandedId;
  });

  const toggleItem = (id) => {
    if (type === 'multiple') {
      setExpandedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setExpandedIds((prev) => (prev === id ? null : id));
    }
  };

  const isExpanded = (id) => {
    if (type === 'multiple') return expandedIds.includes(id);
    return expandedIds === id;
  };

  return (
    <AccordionContext.Provider value={{ isExpanded, toggleItem }}>
      <div className={`divide-y divide-borderToken-default border border-borderToken-default rounded-card overflow-hidden bg-surface-card shadow-sm ${className}`}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
};

const AccordionItemContext = createContext(null);

// Compound Item Component
Accordion.Item = ({ id, children, disabled = false, className = '' }) => {
  const { isExpanded, toggleItem } = useContext(AccordionContext) || {};
  const isOpen = isExpanded ? isExpanded(id) : false;

  const handleToggle = () => {
    if (disabled) return;
    if (toggleItem) toggleItem(id);
  };

  return (
    <AccordionItemContext.Provider value={{ id, isOpen, handleToggle, disabled }}>
      <div className={`transition-colors ${className}`}>{children}</div>
    </AccordionItemContext.Provider>
  );
};

// Compound Header Component
Accordion.Header = ({ children, className = '' }) => {
  const { id, isOpen, handleToggle, disabled } = useContext(AccordionItemContext) || {};

  return (
    <button
      type="button"
      id={`accordion-header-${id}`}
      aria-expanded={isOpen}
      aria-controls={`accordion-panel-${id}`}
      disabled={disabled}
      onClick={handleToggle}
      className={`w-full flex items-center justify-between p-4 text-left font-bold text-sm text-textColor-primary hover:bg-borderToken-light/40 transition-colors duration-150 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <span className="flex-1">{children}</span>
      <motion.span
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.2 }}
        className="ml-2 text-textColor-muted"
      >
        <FiChevronDown className="text-base" />
      </motion.span>
    </button>
  );
};

// Compound Body Component
Accordion.Body = ({ children, className = '' }) => {
  const { id, isOpen } = useContext(AccordionItemContext) || {};

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key={`panel-${id}`}
          id={`accordion-panel-${id}`}
          role="region"
          aria-labelledby={`accordion-header-${id}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className={`p-4 pt-1 text-xs text-textColor-secondary leading-relaxed ${className}`}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Accordion;
