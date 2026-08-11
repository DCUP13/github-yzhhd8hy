import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface OrgInfo {
  id: string;
  name: string;
  role: string;
}

interface OrganizationContextType {
  orgs: OrgInfo[];
  selectedOrg: OrgInfo | null;
  selectedOrgId: string | null;
  currentRole: string;
  loading: boolean;
  showSwitcher: boolean;
  setShowSwitcher: (v: boolean) => void;
  showCreateOrg: boolean;
  setShowCreateOrg: (v: boolean) => void;
  switchOrg: (id: string) => void;
  handleOrgCreated: (org: OrgInfo) => void;
  handleOrgDeleted: () => void;
  refresh: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType>({
  orgs: [],
  selectedOrg: null,
  selectedOrgId: null,
  currentRole: 'member',
  loading: true,
  showSwitcher: false,
  setShowSwitcher: () => {},
  showCreateOrg: false,
  setShowCreateOrg: () => {},
  switchOrg: () => {},
  handleOrgCreated: () => {},
  handleOrgDeleted: () => {},
  refresh: async () => {},
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) ?? null;
  const currentRole = selectedOrg?.role ?? 'member';

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      setOrgs([]);
      setSelectedOrgId(null);
      setLoading(false);
      return;
    }

    const orgIds = memberships.map(m => m.organization_id);
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);

    const merged: OrgInfo[] = (orgData ?? []).map(org => ({
      id: org.id,
      name: org.name,
      role: memberships.find(m => m.organization_id === org.id)?.role ?? 'member',
    })).sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (b.role === 'owner' && a.role !== 'owner') return 1;
      return a.name.localeCompare(b.name);
    });

    setOrgs(merged);
    setSelectedOrgId(prev => {
      if (prev && merged.find(o => o.id === prev)) return prev;
      return merged[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let userId: string | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;

      channel = supabase.channel('org-membership-sync')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'organization_members', filter: `user_id=eq.${userId}` },
          () => { refresh(); }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  function switchOrg(id: string) {
    setSelectedOrgId(id);
    setShowSwitcher(false);
  }

  function handleOrgCreated(newOrg: OrgInfo) {
    setOrgs(prev => {
      const updated = [...prev, newOrg].sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (b.role === 'owner' && a.role !== 'owner') return 1;
        return a.name.localeCompare(b.name);
      });
      return updated;
    });
    setSelectedOrgId(newOrg.id);
    setShowCreateOrg(false);
  }

  function handleOrgDeleted() {
    const deletedId = selectedOrgId;
    setOrgs(prev => {
      const remaining = prev.filter(o => o.id !== deletedId);
      if (!remaining.find(o => o.id === selectedOrgId)) {
        setSelectedOrgId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  }

  return (
    <OrganizationContext.Provider value={{
      orgs,
      selectedOrg,
      selectedOrgId,
      currentRole,
      loading,
      showSwitcher,
      setShowSwitcher,
      showCreateOrg,
      setShowCreateOrg,
      switchOrg,
      handleOrgCreated,
      handleOrgDeleted,
      refresh,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
