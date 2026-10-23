import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Tag, ShoppingCart, Plus, Minus, Trash2, X } from 'lucide-react';

const categoryLabel = {
  accessories: 'Accessories', maintenance: 'Maintenance', tools: 'Tools',
  caps: 'Caps', liners: 'Liners', services: 'Services', other: 'Other',
};

export default function StorePage() {
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);

  useEffect(() => {
    base44.entities.StoreItem.filter({ is_active: true }, 'item_name', 100).then(setItems);
  }, []);

  const categories = ['all', ...new Set(items.map(i => i.category).filter(Boolean))];
  const filtered = activeCategory === 'all' ? items : items.filter(i => i.category === activeCategory);

  return (
    <div className="space-y-6">
      {/* Cart Sidebar */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative bg-background w-full max-w-sm shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg">Your Cart</h2>
              <Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Your cart is empty.</p>
              ) : cart.map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.item_name}</p>
                    <p className="text-xs text-muted-foreground">${c.price?.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(c.id, -1)}>
                      {c.qty === 1 ? <Trash2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    </Button>
                    <span className="text-sm w-5 text-center font-medium">{c.qty}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(c.id, 1)}><Plus className="w-3 h-3" /></Button>
                  </div>
                  <span className="text-sm font-semibold w-16 text-right">${(c.price * c.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t space-y-3">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Checkout</Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Chimney accessories, maintenance products, and more</p>
        </div>
        <Button variant="outline" className="relative" onClick={() => setCartOpen(true)}>
          <ShoppingCart className="w-4 h-4 mr-2" /> Cart
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{cartCount}</span>
          )}
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {cat === 'all' ? 'All Products' : categoryLabel[cat] || cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No products available.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id} className="border-0 shadow-sm overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt={item.item_name} className="w-full h-44 object-cover" />
              ) : (
                <div className="w-full h-44 bg-muted flex items-center justify-center">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground/40" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm">{item.item_name}</h3>
                    {item.category && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Tag className="w-3 h-3" />{categoryLabel[item.category] || item.category}
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-accent text-base">${item.price?.toFixed(2)}</span>
                </div>
                {item.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.description}</p>}
                {item.stock_qty !== undefined && item.stock_qty !== null && (
                  <p className={`text-xs mt-2 font-medium ${item.stock_qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {item.stock_qty > 0 ? `${item.stock_qty} in stock` : 'Out of stock'}
                  </p>
                )}
                <Button
                  className="w-full mt-3 bg-accent text-accent-foreground hover:bg-accent/90"
                  size="sm"
                  disabled={item.stock_qty === 0}
                  onClick={() => addToCart(item)}
                >
                  <ShoppingCart className="w-3 h-3 mr-1" /> Add to Cart
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}