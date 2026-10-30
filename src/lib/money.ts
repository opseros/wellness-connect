const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Stored money is integer paise; show whole rupees. */
export const formatPaise = (paise: number) => inr.format(Math.round(paise / 100));
export const paiseRange = (min: number, max: number) => (min === max ? formatPaise(min) : `${formatPaise(min)} – ${formatPaise(max)}`);
export const paiseToRupees = (paise: number) => Math.round(paise) / 100;
