# تشغيل Realtime في K-Waiter 3

يعمل التطبيق دائمًا بـpolling احتياطي. عند ضبط Pusher أو Soketi ينتقل تلقائيًا إلى قناة WebSocket خاصة بالمؤسسة والفرع، ويستخدم polling فقط كشبكة أمان.

## إعداد Laravel

مثال Soketi خلف HTTPS:

```dotenv
BROADCAST_DRIVER=pusher
PUSHER_APP_ID=kwaiter
PUSHER_APP_KEY=CHANGE_ME
PUSHER_APP_SECRET=CHANGE_ME
PUSHER_HOST=realtime.example.com
PUSHER_PORT=443
PUSHER_SCHEME=https
PUSHER_APP_CLUSTER=mt1
```

ثم:

```bash
php artisan config:clear
php artisan config:cache
```

القناة خاصة باسم `private-waiter-v3.{businessId}.{locationId}`. المصادقة تمر عبر `/api/waiter/v3/broadcasting/auth` بنفس Bearer Token الخاص بالتابلت، ولا يحتوي الحدث على اسم عميل أو تفاصيل طلب؛ فقط نوع الحدث ورقم العنصر.

إذا انقطع WebSocket لا يفشل إنشاء الطلب أو الدفع، وتظهر شاشة صحة الجهاز أن polling الاحتياطي هو المستخدم.

