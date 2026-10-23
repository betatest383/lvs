export const CONSUMABLE_CATEGORIES = [
  {
    name: 'Sealants',
    items: [
      { name: 'High Heat Silicone', unit: 'Tube' },
      { name: 'Clear Silicone', unit: 'Tube' },
      { name: 'White Silicone', unit: 'Tube' },
      { name: 'Tar In A Tube', unit: 'Tube' },
      { name: 'Furnace Cement', unit: 'Tube' },
    ],
  },
  {
    name: 'Fasteners',
    items: [
      { name: '1/2" Zip Screws', unit: 'Box' },
      { name: '3/4" Zip Screws', unit: 'Box' },
      { name: 'Black Zip Screws', unit: 'Box' },
      { name: '1/4" Stainless Machine Screw', unit: 'Piece' },
      { name: '5/16" Stainless Machine Screw', unit: 'Piece' },
      { name: '3-1/2" Gold Screw', unit: 'Box' },
      { name: '1-1/2" Gold Screw', unit: 'Box' },
      { name: 'Lag Bolts', unit: 'Box' },
      { name: 'Lag Shields', unit: 'Bag' },
      { name: 'Washers', unit: 'Bag' },
      { name: 'Cotter Pins', unit: 'Bag' },
      { name: 'Finishing Nails', unit: 'Box' },
      { name: 'Masonry Nails', unit: 'Box' },
      { name: 'Tapcons', unit: 'Box' },
    ],
  },
  {
    name: 'PPE',
    items: [
      { name: 'Rubber Gloves', unit: 'Pair' },
      { name: 'Coated Work Gloves', unit: 'Pair' },
      { name: 'Booties', unit: 'Pair' },
      { name: 'Tyvek Suit', unit: 'Piece' },
      { name: 'Safety Ear Plugs', unit: 'Pair' },
    ],
  },
  {
    name: 'Tape & Supplies',
    items: [
      { name: 'Gorilla Tape', unit: 'Roll' },
      { name: 'Blue/Green Tape', unit: 'Roll' },
      { name: 'Metal Tape', unit: 'Roll' },
      { name: 'Garbage Bags', unit: 'Bag' },
      { name: 'Grout Bags', unit: 'Bag' },
      { name: 'Crocodile Wipes', unit: 'Container' },
      { name: 'WD40', unit: 'Container' },
    ],
  },
  {
    name: 'Concrete',
    items: [
      { name: 'Microfiber Reinforced Concrete', unit: 'Container' },
    ],
  },
  {
    name: 'Grinding Wheels',
    items: [
      { name: 'Thin Black Wheel', unit: 'Wheel' },
      { name: 'Thin Diamond Wheel', unit: 'Wheel' },
      { name: 'Thick Diamond Wheel', unit: 'Wheel' },
      { name: 'Cup Wheel', unit: 'Wheel' },
      { name: 'Flap Wheel', unit: 'Wheel' },
    ],
  },
  {
    name: 'Jobsite Protection',
    items: [
      { name: 'Indoor Drop Cloth', unit: 'Piece' },
      { name: 'Outdoor Drop Cloth', unit: 'Piece' },
      { name: 'Tarp', unit: 'Piece' },
      { name: 'Ratchet Strap', unit: 'Piece' },
      { name: 'Banding Strap', unit: 'Piece' },
    ],
  },
];

export const ALL_CONSUMABLE_ITEMS = CONSUMABLE_CATEGORIES.flatMap(cat =>
  cat.items.map(item => ({ ...item, category: cat.name }))
);