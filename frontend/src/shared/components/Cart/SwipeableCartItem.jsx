import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FiTrash2, FiHeart, FiAlertCircle } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { useCartStore } from "../../store/useStore";
import { useWishlistStore } from "../../store/wishlistStore";
import Price from "../Price";
import { formatVariantLabel } from "../../utils/variant";
import { resolvePriceForQuantity } from "../../utils/resolvePriceForQuantity";
import useSwipeGesture from "../../../modules/UserApp/hooks/useSwipeGesture";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { Card, Button, QuantitySelector, Badge } from "../ui";

const SwipeableCartItem = ({ item, index }) => {
    const { getTranslatedText: t } = usePageTranslation([
        "Only",
        "items available in stock",
        "left!",
        "Saved for later!",
        "Item removed",
        "Undo",
        "Save for Later"
    ]);

    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isDeleted, setIsDeleted] = useState(false);
    const [hasAnimated, setHasAnimated] = useState(false);
    const deletedItemRef = useRef(null);

    // Preview-only tier pricing for this line; checkout re-derives server-side.
    const linePricing = resolvePriceForQuantity(
        {
            retailEnabled: item?.retailEnabled,
            wholesaleEnabled: item?.wholesaleEnabled,
            wholesale: item?.wholesale,
        },
        Number(item?.price) || 0,
        Number(item?.quantity) || 0,
        { vendorWholesaleEnabled: item?.vendorWholesaleEnabled !== false }
    );
    const isBulkApplied = linePricing.pricingType === "wholesale" && linePricing.savings > 0;
    // Only wholesale-only lines have a hard purchase floor; hybrid lines may drop
    // below the tier threshold and simply revert to retail pricing.
    const isWholesaleOnlyLine =
        item?.wholesaleEnabled === true
        && item?.retailEnabled === false
        && item?.vendorWholesaleEnabled !== false;
    const minimumOrderQuantity = isWholesaleOnlyLine
        ? Number(linePricing.minimumQuantity) || 1
        : 1;

    const { removeItem, updateQuantity } = useCartStore();
    const { addItem: addToWishlist } = useWishlistStore();

    useEffect(() => {
        setHasAnimated(true);
    }, []);

    const getProductStock = () => Number(item?.stockQuantity);
    const isLowStock = () => String(item?.stock || "") === "low_stock";

    const handleQuantityChange = (newQty) => {
        const availableStock = Number(item?.stockQuantity);

        if (newQty <= 0) {
            removeItem(item.id, item.variant);
            return;
        }

        if (Number.isFinite(availableStock) && newQty > availableStock) {
            toast.error(`${t('Only')} ${availableStock} ${t('items available in stock')}`);
            return;
        }

        // Wholesale-only lines cannot go below their minimum order quantity;
        // block it here rather than letting checkout reject the whole order.
        if (minimumOrderQuantity > 1 && newQty < minimumOrderQuantity) {
            toast.error(`${t('Minimum order')}: ${minimumOrderQuantity} ${t('units')}`);
            return;
        }

        updateQuantity(item.id, newQty, item.variant);
    };

    const handleSaveForLater = (item) => {
        const addedToWishlist = addToWishlist({
            id: item.id,
            name: item.name,
            price: item.price,
            image: item.image,
        });
        if (!addedToWishlist) return;
        removeItem(item.id, item.variant);
        toast.success(t("Saved for later!"));
    };

    const handleSwipeRight = () => {
        setIsDeleted(true);
        deletedItemRef.current = { ...item };
        removeItem(item.id, item.variant);
        toast.success(t("Item removed"), {
            duration: 3000,
            action: {
                label: t("Undo"),
                onClick: () => {
                    if (deletedItemRef.current) {
                        const { addItem: addToCart } = useCartStore.getState();
                        addToCart(deletedItemRef.current);
                        setIsDeleted(false);
                        deletedItemRef.current = null;
                    }
                },
            },
        });
    };

    const swipeHandlers = useSwipeGesture({
        onSwipeRight: handleSwipeRight,
        threshold: 100,
    });

    useEffect(() => {
        if (swipeHandlers.swipeState.isSwiping) {
            setSwipeOffset(Math.max(0, swipeHandlers.swipeState.offset));
        } else if (!swipeHandlers.swipeState.isSwiping && swipeOffset < 100) {
            setSwipeOffset(0);
        }
    }, [swipeHandlers.swipeState.isSwiping, swipeHandlers.swipeState.offset]);

    if (isDeleted) return null;

    return (
        <motion.div
            initial={hasAnimated ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, x: swipeOffset }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
            }}
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
            className="relative"
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchMove={swipeHandlers.onTouchMove}
            onTouchEnd={swipeHandlers.onTouchEnd}>
            <Card variant="default" padding="sm" className="relative flex gap-4 bg-surface border border-border shadow-sm">
                {/* Delete Background */}
                {swipeOffset > 0 && (
                    <div className="absolute inset-0 bg-status-error rounded-card flex items-center justify-end pr-4">
                        <FiTrash2 className="text-white text-xl" />
                    </div>
                )}

                {/* Product Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-card overflow-hidden bg-surface-muted border border-border relative z-10">
                    <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0 relative z-10 flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-content text-sm mb-0.5 line-clamp-1">
                            {item.name}
                        </h3>
                        <div className="flex items-center gap-2 mb-1">
                            <Price amount={linePricing.unitPrice} className="text-sm font-black text-brand-primary" />
                            {isBulkApplied && (
                                <>
                                    <Price
                                        amount={linePricing.unitRetailPrice}
                                        className="text-xs text-textColor-muted line-through"
                                    />
                                    <Badge variant="success" size="sm">Bulk</Badge>
                                </>
                            )}
                        </div>
                        {isBulkApplied && (
                            <p className="text-[11px] font-bold text-status-success mb-1">
                                {t('Bulk pricing applied')} — {t('you save')} <Price amount={linePricing.savings} />
                            </p>
                        )}
                        {linePricing?.nextTier && (
                            <p className="text-[11px] text-textColor-muted mb-1 font-medium">
                                {t('Buy')} {Math.max(1, linePricing.nextTier.minQty - Number(item.quantity || 0))} {t('more to unlock')}{' '}
                                <Price amount={linePricing.nextTier.price} /> {t('per unit')}
                            </p>
                        )}
                        {formatVariantLabel(item?.variant) && (
                            <p className="text-xs text-content-secondary mb-1 font-medium">
                                {formatVariantLabel(item?.variant)}
                            </p>
                        )}

                        {/* Low Stock Warning */}
                        {isLowStock() && (
                            <div className="flex items-center gap-1 text-[11px] text-status-warning mb-1.5 font-bold">
                                <FiAlertCircle className="text-xs" />
                                <span>{t('Only')} {getProductStock()} {t('left!')}</span>
                            </div>
                        )}
                    </div>

                    {/* Quantity & Actions Bar */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
                        <QuantitySelector
                            value={item.quantity}
                            onChange={handleQuantityChange}
                            min={minimumOrderQuantity}
                            max={item.stockQuantity || 99}
                            size="sm"
                        />

                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="xs"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSaveForLater(item);
                                }}
                                leftIcon={<FiHeart />}
                            >
                                {t('Save for Later')}
                            </Button>
                            <Button
                                variant="danger"
                                size="xs"
                                iconOnly
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeItem(item.id, item.variant);
                                }}
                                leftIcon={<FiTrash2 />}
                            />
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
};

export default SwipeableCartItem;




