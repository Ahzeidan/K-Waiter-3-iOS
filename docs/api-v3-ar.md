# عقد API الخاص بـK-Waiter 3

المسار الأساسي: `/api/waiter/v3`

كل الاستجابات JSON. المسارات المحمية تستخدم:

```http
Authorization: Bearer <device-access-token>
Accept: application/json
X-Client-Version: 3.0.0
X-Trace-Id: <uuid>
```

عمليات الكتابة الحساسة ترسل كذلك `Idempotency-Key`. يعيد السيرفر نفس نتيجة العملية عند إعادة نفس المفتاح، وبذلك لا يتكرر الطلب أو الدفع بسبب ضعف الشبكة.

## المصادقة والجهاز

| الطريقة | المسار | الاستخدام |
|---|---|---|
| GET | `/health` | فحص توفر السيرفر |
| POST | `/auth/login` | دخول المستخدم وتسجيل التابلت |
| POST | `/auth/refresh` | تدوير Access وRefresh Token |
| POST | `/auth/logout` | إلغاء جلسة هذا الجهاز |
| GET | `/bootstrap` | المستخدم والفرع والصلاحيات وإعدادات الجهاز |
| POST | `/broadcasting/auth` | تصريح قناة Realtime الخاصة بالفرع |
| GET/PUT | `/device/settings` | قراءة/حفظ إعدادات هذا التابلت |
| POST | `/device/diagnostics` | رفع أخطاء منقحة دون بيانات طلب أو عميل |

## نقطة البيع

| الطريقة | المسار | الاستخدام |
|---|---|---|
| GET | `/menu` | التصنيفات والمنتجات والصور والأسعار |
| GET | `/products/{productId}/choices` | الإضافات والاختيارات والكومبو |
| GET | `/orders` | ملخص الطلبات المتاحة للمستخدم |
| GET | `/orders/{id}` | طلب كامل قابل للعرض أو التعديل |
| POST | `/orders` | إنشاء طلب |
| PUT | `/orders/{id}` | تعديل الطلب مع `serverUpdatedAt` لمنع التعارض |
| POST | `/orders/{id}/kot` | إرسال KOT؛ ويمكن أن يطلب التابلت استلام مهام الطباعة المباشرة |
| POST | `/orders/{id}/reprint-kot` | إعادة KOT مع سبب مسجل في Audit |
| POST | `/orders/{id}/request-payment` | تسجيل طلب الجارسون للتحصيل |
| POST | `/orders/{id}/change-payment` | تغيير طريقة دفع طلب مدفوع مع السبب والصلاحية |
| POST | `/orders/{id}/payments` | تحصيل آمن أو ترحيل تحصيل أوفلاين مع `offlineRecordedAt` ومفتاح منع تكرار |
| POST | `/orders/{id}/bill` | إنشاء مهمة طباعة فاتورة |
| POST | `/print-jobs/{id}/complete` | تأكيد طباعة مهمة استلمها التابلت مباشرة |

عند تعديل نسخة قديمة من طلب أعاد جهاز آخر تغييره، يعيد السيرفر `409 order_conflict` ولا يكتب فوق التعديل الأحدث.

استجابة اختيارات المنتج تجمع الأنواع الثلاثة في `choiceGroups`: النوع `option` من `/product-options`، والنوع `modifier` من `/modules/modifiers`، والنوع `combo` من `/combo-option-groups`. يحتفظ التابلت بها محليًا للعمل أوفلاين، ويعيد السيرفر التحقق من الاختيارات والأسعار والمجموعات الإلزامية عند المزامنة.

## العملاء والعناوين

| الطريقة | المسار | الاستخدام |
|---|---|---|
| GET | `/customers?term=...` | بحث بعد حرفين؛ لا توجد قائمة «آخر 12 عميل» |
| POST | `/customers` | إضافة عميل |
| PUT | `/customers/{id}` | تعديل العميل |
| GET | `/customers/{id}/addresses` | عناوين العميل |
| POST | `/customers/{id}/addresses` | إضافة عنوان |
| PUT | `/customers/{id}/addresses/{addressId}` | تعديل العنوان |

## التشغيل اليومي

| الطريقة | المسار | الاستخدام |
|---|---|---|
| GET | `/tables` | حالة الطاولات والنداءات |
| POST | `/tables/transfer` | نقل طلب |
| POST | `/tables/merge` | دمج طاولتين |
| POST | `/tables/split` | تقسيم أصناف إلى طاولة أخرى |
| POST | `/calls/ack` | استلام نداء طاولة |
| GET | `/notifications` | Snapshot للتنبيهات وfallback عند غياب WebSocket |
| GET | `/pickup-waiters` | مسؤولو الاستلام المتاحون |
| GET | `/shift` | حالة الوردية |
| POST | `/shift/open` | فتح الوردية |
| POST | `/shift/close` | إغلاق وتسوية الوردية |
| GET | `/printers` | طابعات الفرع |
| POST | `/printers/{id}/test` | مهمة طباعة تجريبية |

## حالات الخطأ المهمة

- `401`: الجلسة منتهية؛ يحاول التطبيق تجديدها مرة واحدة.
- `403`: الدور لا يملك الصلاحية.
- `409 order_conflict`: الطلب تغير من جهاز آخر ويحتاج مراجعة.
- `422`: بيانات ناقصة أو غير صالحة.
- `429`: تجاوز معدل الطلبات أو محاولات الدخول.
- `5xx`: خطأ سيرفر؛ يحتفظ التطبيق بالطلب محليًا عندما تكون العملية قابلة للمزامنة.
