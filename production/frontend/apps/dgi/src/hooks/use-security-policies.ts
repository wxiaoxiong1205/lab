import { useRequest } from 'ahooks'
import { useMemo, useState } from 'react'
import { apiSystemConfig } from '@/services/api'

export const useSecurityPolicies = () => {
  // const { data, loading } = useRequest(apiSystemConfig);
  // const policyOptions = useMemo(() => {
  //   const policies = data?.data?.security_policies || [];
  //   return policies.map((policy: { name: string; id: string }) => ({
  //     label: policy.name,
  //     value: policy.id,
  //   }));
  // }, [data]);

  return {
    policyOptions: [],
    loading: false,
  }
}
