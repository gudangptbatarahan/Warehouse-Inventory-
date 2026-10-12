/**
 * Role-Based Access Control (RBAC) & Authentication Context
 * 6 Official System Roles: Supervisor, Evaluator, Shift A, Shift B, Shift C, Shift D.
 * Strictly uses role names without personal names.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserAccount, StaffGroup } from '../types/inventory';

export const PRESEEDED_USERS: UserAccount[] = [
  {
    id: 'usr-supervisor',
    username: 'Supervisor',
    name: 'Supervisor',
    role: 'supervisor',
    group: 'None',
    email: 'supervisor@ptba',
    pin: 'spv#wmstarahan2026'
  },
  {
    id: 'usr-evaluator',
    username: 'Evaluator',
    name: 'Evaluator',
    role: 'evaluator',
    group: 'None',
    email: 'evaluator@ptba',
    pin: 'evl#bukitasam2026'
  },
  {
    id: 'usr-reviewer',
    username: 'Reviewer',
    name: 'Reviewer',
    role: 'reviewer',
    group: 'None',
    email: 'reviewer@ptba',
    pin: ''
  },
  {
    id: 'usr-shift-a',
    username: 'Shift A',
    name: 'Shift A',
    role: 'staff',
    group: 'Group A',
    email: 'shift_a@ptba',
    pin: 'shift_A@PTBA'
  },
  {
    id: 'usr-shift-b',
    username: 'Shift B',
    name: 'Shift B',
    role: 'staff',
    group: 'Group B',
    email: 'shift_b@ptba',
    pin: 'shift_B*PTBA'
  },
  {
    id: 'usr-shift-c',
    username: 'Shift C',
    name: 'Shift C',
    role: 'staff',
    group: 'Group C',
    email: 'shift_c@ptba',
    pin: 'shift_C#PTBA'
  },
  {
    id: 'usr-shift-d',
    username: 'Shift D',
    name: 'Shift D',
    role: 'staff',
    group: 'Group D',
    email: 'shift_d@ptba',
    pin: 'shift_D!PTBA'
  }
];

interface AuthContextType {
  currentUser: UserAccount | null;
  currentGroup: StaffGroup;
  login: (username: string, pin?: string) => boolean;
  setStaffGroup: (group: StaffGroup) => void;
  logout: () => void;
  isAuthenticated: boolean;
  // Role checks
  isSupervisor: boolean;
  isEvaluator: boolean;
  isShiftStaff: boolean;
  isReviewer: boolean;
  // Granular RBAC Permissions
  canManageMaster: boolean; // Add/edit master items (Supervisor only)
  canDeleteMaster: boolean; // Delete master items (Supervisor only)
  canMutateStock: boolean; // IN / OUT stock transactions (Supervisor & Shift A-D)
  canScan: boolean; // Barcode/QR scanning (All roles)
  canSearch: boolean; // Search inventory & PR (All roles)
  canExportMutasi: boolean; // Export mutation history (Supervisor & Shift A-D)
  canExportMaster: boolean; // Export master catalog & PR (Supervisor & Evaluator)
  canImportExport: boolean; // Import master data (Supervisor only)
  canManagePR: boolean; // Full control over PR Requests (Supervisor & Evaluator)
  canEditMutation: boolean; // Edit mutation history date/time/ref (Supervisor & Shift A-D)
  canDeleteMutation: boolean; // Delete mutation history (Supervisor ONLY - Shifts CANNOT delete)
  canStockTake: boolean; // STO physical audit (Supervisor & Shift A-D)
  canApproveVariance: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('wms_auth_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Match against current 6 accounts to strip any legacy personal names
        const matched = PRESEEDED_USERS.find(
          u => u.username.toLowerCase() === (parsed.username || '').toLowerCase() || 
               u.name.toLowerCase() === (parsed.name || '').toLowerCase() ||
               u.id === parsed.id
        );
        if (matched) return matched;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [currentGroup, setCurrentGroup] = useState<StaffGroup>(() => {
    try {
      return (localStorage.getItem('wms_staff_group') as StaffGroup) || 'Group A';
    } catch {
      return 'Group A';
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('wms_auth_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('wms_auth_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('wms_staff_group', currentGroup);
  }, [currentGroup]);

  const login = (inputUsername: string, inputPin?: string): boolean => {
    const cleanUser = inputUsername.trim().toLowerCase().replace(/[\s_-]+/g, '');
    const pin = (inputPin || '').trim();

    // Check direct matching or Shift C / Shift D flexibility
    let user = PRESEEDED_USERS.find(u => {
      const uNorm = u.username.toLowerCase().replace(/[\s_-]+/g, '');
      return uNorm === cleanUser || u.username.toLowerCase() === inputUsername.trim().toLowerCase();
    });

    // Special allowance if user entered Shift C with shift_D!PTBA
    if (cleanUser === 'shiftc' && pin === 'shift_D!PTBA') {
      user = PRESEEDED_USERS.find(u => u.username === 'Shift D') || user;
    }

    if (!user) return false;
    
    // For Reviewer: no password needed at all!
    if (user.role === 'reviewer' || user.username.toLowerCase() === 'reviewer') {
      setCurrentUser(user);
      return true;
    }

    // Strict password check for other roles
    const validPins = [user.pin];
    if (user.username === 'Shift C') {
      validPins.push('shift_D!PTBA');
    }
    if (!validPins.includes(pin)) {
      return false;
    }

    setCurrentUser(user);
    if (user.group !== 'None') {
      setCurrentGroup(user.group);
    }
    return true;
  };

  const setStaffGroup = (group: StaffGroup) => {
    setCurrentGroup(group);
    if (currentUser) {
      setCurrentUser({ ...currentUser, group });
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('wms_auth_user');
  };

  const role = (currentUser?.role || '').toLowerCase();
  const username = (currentUser?.username || '').toLowerCase();
  const name = (currentUser?.name || '').toLowerCase();
  const isSupervisor = role === 'admin' || role === 'supervisor' || username === 'supervisor' || name === 'supervisor';
  const isEvaluator = role === 'evaluator' || username === 'evaluator' || name === 'evaluator';
  const isShiftStaff = role === 'staff' || username.startsWith('shift');
  const isReviewer = role === 'reviewer' || username === 'reviewer' || name === 'reviewer';

  // Granular Access Rights strictly aligned with user specifications:
  // Supervisor: akses penuh
  // Evaluator: kendali penuh bagian PR Request, scan barang, search barang, export file
  // Shift A - D: mutasi barang masuk keluar, scan barang, export file mutasi, edit riwayat mutasi (in case salah tanggal/jam) tapi GABISA hapus riwayat
  // Reviewer: hanya cari barang dan scan QR saja
  const canManageMaster = isSupervisor;
  const canDeleteMaster = isSupervisor;
  const canMutateStock = isSupervisor || isShiftStaff;
  const canScan = true;
  const canSearch = true;
  const canExportMutasi = isSupervisor || isShiftStaff;
  const canExportMaster = isSupervisor || isEvaluator;
  const canImportExport = isSupervisor;
  const canManagePR = isSupervisor || isEvaluator;
  const canEditMutation = isSupervisor || isShiftStaff;
  const canDeleteMutation = isSupervisor; // Only Supervisor can delete mutation history!
  const canStockTake = isSupervisor || isShiftStaff;
  const canApproveVariance = isSupervisor;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentGroup,
        login,
        setStaffGroup,
        logout,
        isAuthenticated: !!currentUser,
        isSupervisor,
        isEvaluator,
        isShiftStaff,
        isReviewer,
        canManageMaster,
        canDeleteMaster,
        canMutateStock,
        canScan,
        canSearch,
        canExportMutasi,
        canExportMaster,
        canImportExport,
        canManagePR,
        canEditMutation,
        canDeleteMutation,
        canStockTake,
        canApproveVariance
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
