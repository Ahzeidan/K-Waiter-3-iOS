import { localDatabase } from '@/app/services/local-database';
import { ORDER_TYPE_LABELS } from '@/app/settings/defaults';
import { money } from '@/shared/format';
import type { CartLine, OrderDetail, OrderDraft, ReceiptSnapshot } from '@/shared/domain';
import { getActiveDataScope, scopedKey } from '@/app/services/data-scope';
import { getUiLanguage, orderTypeLabel, translateText } from '@/app/services/localization';

interface ReceiptContext {
  businessName?: string;
  locationName?: string;
}

function lineSnapshot(line: CartLine) {
  const choiceTotal = line.choices.reduce((sum, choice) => sum + Number(choice.price || 0), 0);
  return {
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice + choiceTotal,
    total: (line.unitPrice + choiceTotal) * line.quantity,
    choices: line.choices.map(choice => choice.name),
    ...(line.note ? { note: line.note } : {}),
  };
}

export function receiptFromOrder(order: OrderDetail, context: ReceiptContext = {}): ReceiptSnapshot {
  return {
    scope: getActiveDataScope(),
    key: scopedKey(`order:${order.id}`),
    orderId: order.id,
    invoiceNo: order.invoiceNo || `#${order.id}`,
    businessName: context.businessName || 'K-Waiter',
    language: getUiLanguage(),
    ...(context.locationName ? { locationName: context.locationName } : {}),
    orderType: order.type,
    ...(order.customerName ? { customerName: order.customerName } : {}),
    ...(order.customerMobile ? { customerMobile: order.customerMobile } : {}),
    ...(order.address ? { deliveryAddress: [order.address.label, order.address.area, order.address.block, order.address.street, order.address.building, order.address.floor, order.address.apartment].filter(Boolean).join('، ') } : {}),
    ...(order.tableName ? { tableName: order.tableName } : {}),
    paymentStatus: order.paymentStatus,
    ...(order.paymentMethod ? { paymentMethod: order.paymentMethod } : {}),
    ...(order.subtotal === undefined ? {} : { subtotal: order.subtotal }),
    ...(order.discount === undefined ? {} : { discount: order.discount }),
    ...(order.tax === undefined ? {} : { tax: order.tax }),
    ...(order.serviceCharge === undefined ? {} : { serviceCharge: order.serviceCharge }),
    ...(order.waiterName ? { waiterName: order.waiterName } : {}),
    ...(order.taxNumber ? { taxNumber: order.taxNumber } : {}),
    ...(order.receiptFooter ? { footer: order.receiptFooter } : {}),
    total: order.total,
    createdAt: order.createdAt,
    temporary: false,
    lines: order.lines.map(lineSnapshot),
  };
}

export function receiptFromDraft(
  draft: OrderDraft,
  options: ReceiptContext & { orderId?: number; invoiceNo?: string; temporary?: boolean; paymentStatus?: ReceiptSnapshot['paymentStatus']; paymentMethod?: string } = {},
): ReceiptSnapshot {
  return {
    scope: draft.scope,
    key: options.orderId ? scopedKey(`order:${options.orderId}`) : scopedKey(`draft:${draft.localId}`),
    ...(options.orderId ? { orderId: options.orderId } : {}),
    localOrderId: draft.localId,
    invoiceNo: options.invoiceNo || (options.orderId ? `#${options.orderId}` : `محلي-${draft.localId.slice(-6)}`),
    businessName: options.businessName || 'K-Waiter',
    language: getUiLanguage(),
    ...(options.locationName ? { locationName: options.locationName } : {}),
    orderType: draft.type,
    ...(draft.customerSnapshot?.name ? { customerName: draft.customerSnapshot.name } : {}),
    ...(draft.customerSnapshot?.mobile ? { customerMobile: draft.customerSnapshot.mobile } : {}),
    ...(draft.addressSnapshot ? { deliveryAddress: [draft.addressSnapshot.label, draft.addressSnapshot.area, draft.addressSnapshot.block, draft.addressSnapshot.street, draft.addressSnapshot.building, draft.addressSnapshot.floor, draft.addressSnapshot.apartment].filter(Boolean).join('، ') } : {}),
    ...(draft.tableId ? { tableName: `طاولة ${draft.tableId}` } : {}),
    paymentStatus: options.paymentStatus ?? 'due',
    ...(options.paymentMethod ? { paymentMethod: options.paymentMethod } : {}),
    total: draft.lines.reduce((sum, line) => sum + lineSnapshot(line).total, 0),
    createdAt: draft.updatedAt,
    temporary: options.temporary ?? !options.orderId,
    lines: draft.lines.map(lineSnapshot),
  };
}

export async function cacheReceipt(receipt: ReceiptSnapshot): Promise<void> {
  await localDatabase.put('receipts', receipt.key, receipt);
}

export async function cachedOrderReceipt(orderId: number): Promise<ReceiptSnapshot | null> {
  return await localDatabase.get<ReceiptSnapshot>('receipts', scopedKey(`order:${orderId}`)) ?? null;
}

export async function markReceiptPaid(orderId: number, paymentMethod?: string): Promise<ReceiptSnapshot | null> {
  const receipt = await cachedOrderReceipt(orderId);
  if (!receipt) return null;
  const paid: ReceiptSnapshot = {
    ...receipt,
    paymentStatus: 'paid',
    ...(paymentMethod ? { paymentMethod } : {}),
  };
  await cacheReceipt(paid);
  return paid;
}

export async function markDraftReceiptPaid(localOrderId: string, paymentMethod?: string): Promise<ReceiptSnapshot | null> {
  const key = scopedKey(`draft:${localOrderId}`);
  const receipt = await localDatabase.get<ReceiptSnapshot>('receipts', key);
  if (!receipt) return null;
  const paid = { ...receipt, paymentStatus: 'paid' as const, ...(paymentMethod ? { paymentMethod } : {}) };
  await cacheReceipt(paid);
  return paid;
}

export async function promoteDraftReceipt(localOrderId: string, orderId: number, invoiceNo?: string): Promise<ReceiptSnapshot | null> {
  const oldKey = scopedKey(`draft:${localOrderId}`);
  const receipt = await localDatabase.get<ReceiptSnapshot>('receipts', oldKey);
  if (!receipt) return null;
  const promoted: ReceiptSnapshot = {
    ...receipt,
    key: scopedKey(`order:${orderId}`),
    orderId,
    invoiceNo: invoiceNo || `#${orderId}`,
    temporary: false,
  };
  await cacheReceipt(promoted);
  await localDatabase.delete('receipts', oldKey);
  return promoted;
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = words[0]!;
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (context.measureText(next).width <= maxWidth) current = next;
    else { lines.push(current); current = word; }
  }
  lines.push(current);
  return lines;
}

function renderReceiptRasterArabic(receipt: ReceiptSnapshot, paperWidth: 58 | 80): string {
  const width = paperWidth === 58 ? 384 : 576;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('تعذر تجهيز صورة الفاتورة');
  measure.font = '700 25px Tahoma, Arial, sans-serif';
  const lineCount = receipt.lines.reduce((sum, line) => {
    const nameLines = wrapText(measure, line.name, width - 150).length;
    return sum + nameLines + line.choices.length + (line.note ? 1 : 0);
  }, 0);
  const height = Math.min(12000, 410 + lineCount * 36 + receipt.lines.length * 18);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('تعذر تجهيز صورة الفاتورة');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000';
  context.direction = 'rtl';
  let y = 40;
  const center = (text: string, font = '700 25px Tahoma, Arial, sans-serif', gap = 35) => {
    context.font = font; context.textAlign = 'center'; context.fillText(text, width / 2, y); y += gap;
  };
  const separator = () => {
    context.beginPath(); context.setLineDash([8, 5]); context.moveTo(12, y); context.lineTo(width - 12, y); context.stroke(); context.setLineDash([]); y += 20;
  };
  center(receipt.businessName, '800 32px Tahoma, Arial, sans-serif', 42);
  if (receipt.locationName) center(receipt.locationName, '600 20px Tahoma, Arial, sans-serif', 30);
  center(receipt.documentType === 'kot' ? `طلب مطبخ ${receipt.invoiceNo}` : receipt.temporary ? 'طلب محلي مؤقت' : `فاتورة ${receipt.invoiceNo}`, '800 27px Tahoma, Arial, sans-serif', 38);
  if (receipt.temporary) center(receipt.documentType === 'kot' ? 'نسخة أوفلاين — ستُزامن لاحقًا' : 'لم تتم المزامنة مع السيرفر', '700 19px Tahoma, Arial, sans-serif', 30);
  center(`${ORDER_TYPE_LABELS[receipt.orderType]} · ${new Date(receipt.createdAt).toLocaleString('ar-KW')}`, '600 18px Tahoma, Arial, sans-serif', 28);
  if (receipt.customerName || receipt.tableName) center(receipt.customerName || receipt.tableName || '', '700 21px Tahoma, Arial, sans-serif', 31);
  if (receipt.customerMobile) center(receipt.customerMobile, '600 18px Tahoma, Arial, sans-serif', 27);
  if (receipt.deliveryAddress) center(receipt.deliveryAddress, '600 17px Tahoma, Arial, sans-serif', 27);
  separator();
  if (receipt.documentType !== 'kot' && receipt.subtotal !== undefined) center(`المجموع ${money(receipt.subtotal, undefined, 'ar')}`, '600 19px Tahoma, Arial, sans-serif', 27);
  if (receipt.documentType !== 'kot' && receipt.discount) center(`الخصم -${money(receipt.discount, undefined, 'ar')}`, '600 19px Tahoma, Arial, sans-serif', 27);
  if (receipt.documentType !== 'kot' && receipt.serviceCharge) center(`الخدمة ${money(receipt.serviceCharge, undefined, 'ar')}`, '600 19px Tahoma, Arial, sans-serif', 27);
  if (receipt.documentType !== 'kot' && receipt.tax) center(`الضريبة ${money(receipt.tax, undefined, 'ar')}`, '600 19px Tahoma, Arial, sans-serif', 27);
  for (const line of receipt.lines) {
    context.font = '700 23px Tahoma, Arial, sans-serif';
    context.textAlign = 'right';
    const names = wrapText(context, line.name, width - 155);
    context.fillText(`${line.quantity} × ${names[0]}`, width - 14, y);
    if (receipt.documentType !== 'kot') { context.textAlign = 'left'; context.fillText(money(line.total, undefined, 'ar'), 14, y); }
    y += 32;
    for (const name of names.slice(1)) { context.textAlign = 'right'; context.fillText(name, width - 55, y); y += 30; }
    context.font = '500 18px Tahoma, Arial, sans-serif';
    for (const choice of line.choices) { context.textAlign = 'right'; context.fillText(`+ ${choice}`, width - 55, y); y += 25; }
    if (line.note) { context.textAlign = 'right'; context.fillText(`ملاحظة: ${line.note}`, width - 55, y); y += 25; }
    y += 10;
  }
  separator();
  if (receipt.documentType !== 'kot') {
    context.font = '800 31px Tahoma, Arial, sans-serif';
    context.textAlign = 'right'; context.fillText('الإجمالي', width - 14, y);
    context.textAlign = 'left'; context.fillText(money(receipt.total, undefined, 'ar'), 14, y); y += 44;
    center(receipt.paymentStatus === 'paid' ? 'مدفوع' : receipt.temporary ? 'طلب غير متزامن' : 'مستحق الدفع', '800 23px Tahoma, Arial, sans-serif', 32);
    if (receipt.paymentMethod) center(receipt.paymentMethod, '600 18px Tahoma, Arial, sans-serif', 28);
  }
  if (receipt.waiterName) center(`الجارسون: ${receipt.waiterName}`, '600 18px Tahoma, Arial, sans-serif', 27);
  if (receipt.taxNumber) center(`الرقم الضريبي: ${receipt.taxNumber}`, '600 17px Tahoma, Arial, sans-serif', 25);
  center(receipt.footer || 'شكرًا لكم', '700 20px Tahoma, Arial, sans-serif', 30);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function receiptHtmlArabic(receipt: ReceiptSnapshot): string {
  const lines = receipt.lines.map(line => `<tr><td>${escapeHtml(line.name)} × ${line.quantity}${line.choices.map(choice => `<small>+ ${escapeHtml(choice)}</small>`).join('')}${line.note ? `<small>ملاحظة: ${escapeHtml(line.note)}</small>` : ''}</td><td>${escapeHtml(money(line.total, undefined, 'ar'))}</td></tr>`).join('');
  const customer = [receipt.customerName, receipt.customerMobile, receipt.deliveryAddress].filter(Boolean).map(value => `<p>${escapeHtml(value)}</p>`).join('');
  const breakdown = [['المجموع', receipt.subtotal], ['الخصم', receipt.discount], ['الخدمة', receipt.serviceCharge], ['الضريبة', receipt.tax]].filter(([, value]) => value !== undefined && Number(value) !== 0).map(([label, value]) => `<div class="line"><span>${label}</span><span>${escapeHtml(money(Number(value), undefined, 'ar'))}</span></div>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:-apple-system,Tahoma,sans-serif;padding:20px;color:#111}h1,p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:8px 2px;border-bottom:1px dashed #999}td:last-child{text-align:left}small{display:block;color:#444;margin-top:3px}.line,.total{display:flex;justify-content:space-between;margin-top:8px}.total{font-size:20px;font-weight:800;margin-top:16px}.warning{font-weight:800}</style></head><body><h1>${escapeHtml(receipt.businessName)}</h1><p>${escapeHtml(receipt.temporary ? 'طلب محلي مؤقت — لم تتم المزامنة' : `فاتورة ${receipt.invoiceNo}`)}</p><p>${escapeHtml(ORDER_TYPE_LABELS[receipt.orderType])}</p>${customer}<table>${lines}</table>${breakdown}<div class="total"><span>الإجمالي</span><span>${escapeHtml(money(receipt.total, undefined, 'ar'))}</span></div><p>${escapeHtml(receipt.paymentMethod || '')}</p><p>${escapeHtml(receipt.footer || 'شكرًا لكم')}</p></body></html>`;
}

function renderReceiptRasterEnglish(receipt: ReceiptSnapshot, paperWidth: 58 | 80): string {
  const width = paperWidth === 58 ? 384 : 576;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Unable to prepare receipt image');
  measure.font = '700 25px Arial, sans-serif';
  const lineCount = receipt.lines.reduce((sum, line) => sum + wrapText(measure, line.name, width - 150).length + line.choices.length + (line.note ? 1 : 0), 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.min(12000, 410 + lineCount * 36 + receipt.lines.length * 18);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to prepare receipt image');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000'; context.direction = 'ltr';
  let y = 40;
  const center = (value: string, font = '700 25px Arial, sans-serif', gap = 35) => {
    context.font = font; context.textAlign = 'center'; context.fillText(value, width / 2, y); y += gap;
  };
  const separator = () => {
    context.beginPath(); context.setLineDash([8, 5]); context.moveTo(12, y); context.lineTo(width - 12, y); context.stroke(); context.setLineDash([]); y += 20;
  };
  center(receipt.businessName, '800 32px Arial, sans-serif', 42);
  if (receipt.locationName) center(receipt.locationName, '600 20px Arial, sans-serif', 30);
  center(receipt.documentType === 'kot' ? `Kitchen Order ${receipt.invoiceNo}` : receipt.temporary ? 'Temporary Local Order' : `Receipt ${receipt.invoiceNo}`, '800 27px Arial, sans-serif', 38);
  if (receipt.temporary) center(receipt.documentType === 'kot' ? 'Offline copy — will sync later' : 'Not yet synced with the server', '700 19px Arial, sans-serif', 30);
  center(`${orderTypeLabel(receipt.orderType, 'en')} · ${new Date(receipt.createdAt).toLocaleString('en-KW')}`, '600 18px Arial, sans-serif', 28);
  if (receipt.customerName || receipt.tableName) center(receipt.customerName || receipt.tableName || '', '700 21px Arial, sans-serif', 31);
  if (receipt.customerMobile) center(receipt.customerMobile, '600 18px Arial, sans-serif', 27);
  if (receipt.deliveryAddress) center(receipt.deliveryAddress, '600 17px Arial, sans-serif', 27);
  separator();
  if (receipt.documentType !== 'kot' && receipt.subtotal !== undefined) center(`Subtotal ${money(receipt.subtotal, undefined, 'en')}`, '600 19px Arial, sans-serif', 27);
  if (receipt.documentType !== 'kot' && receipt.discount) center(`Discount -${money(receipt.discount, undefined, 'en')}`, '600 19px Arial, sans-serif', 27);
  if (receipt.documentType !== 'kot' && receipt.serviceCharge) center(`Service ${money(receipt.serviceCharge, undefined, 'en')}`, '600 19px Arial, sans-serif', 27);
  if (receipt.documentType !== 'kot' && receipt.tax) center(`Tax ${money(receipt.tax, undefined, 'en')}`, '600 19px Arial, sans-serif', 27);
  for (const line of receipt.lines) {
    context.font = '700 23px Arial, sans-serif'; context.textAlign = 'left';
    const names = wrapText(context, line.name, width - 155);
    context.fillText(`${line.quantity} × ${names[0]}`, 14, y);
    if (receipt.documentType !== 'kot') { context.textAlign = 'right'; context.fillText(money(line.total, undefined, 'en'), width - 14, y); }
    y += 32;
    for (const name of names.slice(1)) { context.textAlign = 'left'; context.fillText(name, 55, y); y += 30; }
    context.font = '500 18px Arial, sans-serif';
    for (const choice of line.choices) { context.textAlign = 'left'; context.fillText(`+ ${choice}`, 55, y); y += 25; }
    if (line.note) { context.textAlign = 'left'; context.fillText(`Note: ${line.note}`, 55, y); y += 25; }
    y += 10;
  }
  separator();
  if (receipt.documentType !== 'kot') {
    context.font = '800 31px Arial, sans-serif'; context.textAlign = 'left'; context.fillText('Total', 14, y);
    context.textAlign = 'right'; context.fillText(money(receipt.total, undefined, 'en'), width - 14, y); y += 44;
    center(receipt.paymentStatus === 'paid' ? 'PAID' : receipt.temporary ? 'UNSYNCED ORDER' : receipt.paymentStatus === 'partial' ? 'PARTIALLY PAID' : 'PAYMENT DUE', '800 23px Arial, sans-serif', 32);
    if (receipt.paymentMethod) center(translateText(receipt.paymentMethod, 'en'), '600 18px Arial, sans-serif', 28);
  }
  if (receipt.waiterName) center(`Waiter: ${receipt.waiterName}`, '600 18px Arial, sans-serif', 27);
  if (receipt.taxNumber) center(`Tax No.: ${receipt.taxNumber}`, '600 17px Arial, sans-serif', 25);
  center(receipt.footer || 'Thank you', '700 20px Arial, sans-serif', 30);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

export function renderReceiptRaster(receipt: ReceiptSnapshot, paperWidth: 58 | 80): string {
  return (receipt.language ?? getUiLanguage()) === 'en'
    ? renderReceiptRasterEnglish(receipt, paperWidth)
    : renderReceiptRasterArabic(receipt, paperWidth);
}

function receiptHtmlEnglish(receipt: ReceiptSnapshot): string {
  const lines = receipt.lines.map(line => `<tr><td>${escapeHtml(line.name)} × ${line.quantity}${line.choices.map(choice => `<small>+ ${escapeHtml(choice)}</small>`).join('')}${line.note ? `<small>Note: ${escapeHtml(line.note)}</small>` : ''}</td><td>${escapeHtml(money(line.total, undefined, 'en'))}</td></tr>`).join('');
  const customer = [receipt.customerName, receipt.customerMobile, receipt.deliveryAddress].filter(Boolean).map(value => `<p>${escapeHtml(value)}</p>`).join('');
  const breakdown = [['Subtotal', receipt.subtotal], ['Discount', receipt.discount], ['Service', receipt.serviceCharge], ['Tax', receipt.tax]].filter(([, value]) => value !== undefined && Number(value) !== 0).map(([label, value]) => `<div class="line"><span>${label}</span><span>${escapeHtml(money(Number(value), undefined, 'en'))}</span></div>`).join('');
  const title = receipt.documentType === 'kot' ? `Kitchen Order ${receipt.invoiceNo}` : receipt.temporary ? 'Temporary Local Order — not synced' : `Receipt ${receipt.invoiceNo}`;
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>body{font-family:-apple-system,Arial,sans-serif;padding:20px;color:#111}h1,p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:8px 2px;border-bottom:1px dashed #999}td:last-child{text-align:right}small{display:block;color:#444;margin-top:3px}.line,.total{display:flex;justify-content:space-between;margin-top:8px}.total{font-size:20px;font-weight:800;margin-top:16px}.warning{font-weight:800}</style></head><body><h1>${escapeHtml(receipt.businessName)}</h1><p>${escapeHtml(title)}</p><p>${escapeHtml(orderTypeLabel(receipt.orderType, 'en'))}</p>${customer}<table>${lines}</table>${breakdown}<div class="total"><span>Total</span><span>${escapeHtml(money(receipt.total, undefined, 'en'))}</span></div><p>${escapeHtml(receipt.paymentMethod ? translateText(receipt.paymentMethod, 'en') : '')}</p><p>${escapeHtml(receipt.footer || 'Thank you')}</p></body></html>`;
}

export function receiptHtml(receipt: ReceiptSnapshot): string {
  return (receipt.language ?? getUiLanguage()) === 'en' ? receiptHtmlEnglish(receipt) : receiptHtmlArabic(receipt);
}
