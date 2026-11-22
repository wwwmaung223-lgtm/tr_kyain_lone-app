-- The Subscription Center invokes these RPCs from an authenticated session.
-- Keep the admin check inside the payment-review function; never allow anonymous callers.
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

revoke execute on function public.review_kpay_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_kpay_payment(uuid, boolean, text) to authenticated;
