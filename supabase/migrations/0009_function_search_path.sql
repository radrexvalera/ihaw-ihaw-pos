-- 0009_function_search_path.sql
-- Security hardening (Supabase Security Advisor: "Function Search Path Mutable").
-- Pin search_path on the remaining trigger/helper functions so a malicious
-- object in another schema can never shadow what they call.

alter function public.set_updated_at()                  set search_path = public;
alter function public.profiles_guard()                  set search_path = public;
alter function public.products_guard_stock()            set search_path = public;
alter function public.inventory_movements_immutable()   set search_path = public;
alter function public.grill_status_rank(text)           set search_path = public;
