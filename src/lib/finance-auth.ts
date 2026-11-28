import 'server-only'
import { getCurrentUser } from '@/lib/auth-service'
import { hasPermission } from '@/lib/permission-service'

/**
 * Shared Finance Read RBAC Guard
 */
export async function requireFinanceReadAccess() {
    const user = await getCurrentUser()
    if (!user) return null
    const allowed =
        user.role === 'Super Admin' ||
        user.role === 'Finance Admin' ||
        user.role.includes('Campus') ||
        (await hasPermission('settlements')) ||
        (await hasPermission('reports'))
    return allowed ? user : null
}

/**
 * Shared Finance Write RBAC Guard
 */
export async function requireFinanceWriteAccess() {
    const user = await getCurrentUser()
    if (!user) return null
    const allowed =
        user.role === 'Super Admin' ||
        user.role === 'Finance Admin' ||
        (await hasPermission('settlements'))
    return allowed ? user : null
}
