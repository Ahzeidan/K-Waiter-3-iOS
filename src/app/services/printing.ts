import { Capacitor, registerPlugin } from '@capacitor/core';
import { waiterApi } from '@/app/services/waiter-api';
import { operationKeys } from '@/app/services/operation-keys';
import { ApiError } from '@/app/services/api-client';
import { directPrintQueue, isDirectPrintingMode } from '@/app/services/direct-printing';
import {
  cacheReceipt,
  cachedOrderReceipt,
  receiptFromDraft,
  receiptFromOrder,
  receiptHtml,
} from '@/app/services/receipt';
import type { DeviceSettings, OrderDetail, OrderDraft, PrintJobResult, ReceiptSnapshot } from '@/shared/domain';

interface AirPrintPlugin {
  print(options: { html: string; jobName: string }): Promise<{ completed: boolean }>;
}

interface ReceiptContext {
  businessName?: string;
  locationName?: string;
}

const airPrint = registerPlugin<AirPrintPlugin>('KemetAirPrint');

export async function cacheOrderForPrinting(order: OrderDetail, context: ReceiptContext = {}): Promise<ReceiptSnapshot> {
  const receipt = receiptFromOrder(order, context);
  await cacheReceipt(receipt);
  return receipt;
}

async function orderReceipt(orderId: number, context: ReceiptContext = {}): Promise<ReceiptSnapshot> {
  const saved = await cachedOrderReceipt(orderId);
  if (saved) return saved;
  try {
    return await cacheOrderForPrinting(await waiterApi.order(orderId), context);
  } catch {
    throw new Error('لا توجد نسخة محلية لهذه الفاتورة. افتحها مرة واحدة أثناء الاتصال ثم يمكن طباعتها أوفلاين.');
  }
}

async function directOrderPrint(
  orderId: number,
  settings: DeviceSettings,
  context: ReceiptContext,
  automaticJobId?: string,
): Promise<PrintJobResult> {
  const receipt = await orderReceipt(orderId, context);
  receipt.language = settings.language;
  const jobId = automaticJobId ?? await operationKeys.get('print', orderId);
  const result = await directPrintQueue.enqueue(receipt, jobId, settings.printing.receiptCopies, !automaticJobId);
  if (!automaticJobId && !result.queued) await operationKeys.complete('print', orderId);
  return result;
}

export async function printOrderBill(
  orderId: number,
  settings: DeviceSettings,
  context: ReceiptContext = {},
  automaticJobId?: string,
): Promise<PrintJobResult> {
  if (!settings.printing.enabled) throw new Error('الطباعة متوقفة من إعدادات التابلت');
  if (isDirectPrintingMode(settings.printing.mode)) {
    return directOrderPrint(orderId, settings, context, automaticJobId);
  }
  if (settings.printing.mode === 'airprint' && Capacitor.getPlatform() === 'ios') {
    const receipt = await orderReceipt(orderId, context);
    receipt.language = settings.language;
    const result = await airPrint.print({ html: receiptHtml(receipt), jobName: `K-Waiter ${receipt.invoiceNo}` });
    if (!result.completed) throw new Error('تم إلغاء الطباعة');
    return { jobIds: [], jobs: 1, local: true, queued: false };
  }
  const key = await operationKeys.get('print', orderId);
  try {
    const result = await waiterApi.printBill(orderId, settings.printing.receiptCopies, undefined, key);
    await operationKeys.complete('print', orderId);
    return result;
  } catch (reason) {
    if (reason instanceof ApiError && reason.status >= 400 && reason.status !== 409) {
      await operationKeys.complete('print', orderId);
    }
    throw reason;
  }
}

export async function printDraftReceipt(
  draft: OrderDraft,
  settings: DeviceSettings,
  options: ReceiptContext & { orderId?: number; invoiceNo?: string; temporary?: boolean; afterPayment?: boolean; paymentStatus?: ReceiptSnapshot['paymentStatus']; paymentMethod?: string } = {},
): Promise<PrintJobResult | null> {
  if (!settings.printing.enabled || (options.afterPayment ? !settings.printing.autoPrintAfterPayment : !settings.printing.autoPrintOnSave)) return null;
  const receipt = receiptFromDraft(draft, options);
  await cacheReceipt(receipt);
  if (settings.printing.mode === 'airprint' && Capacitor.getPlatform() === 'ios') {
    const result = await airPrint.print({ html: receiptHtml(receipt), jobName: `K-Waiter ${receipt.invoiceNo}` });
    if (!result.completed) throw new Error('تم إلغاء الطباعة');
    return { jobIds: [], jobs: 1, local: true, queued: false };
  }
  if (!isDirectPrintingMode(settings.printing.mode)) return null;
  return directPrintQueue.enqueue(
    receipt,
    `auto-order-${draft.localId}-${draft.revision}`,
    settings.printing.receiptCopies,
  );
}
