REVOKE ALL ON FUNCTION public.provision_user_wallets(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_user_wallets(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_user_wallets(uuid, text, text) TO service_role;