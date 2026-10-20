"use client"

import Link from "next/link";
import { useState, useEffect, useCallback, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { ArrowLeft, ArrowUpRight, Pencil } from "lucide-react"
import { toast } from "sonner"
import { getMemberProfileAction, updateMemberProfileAction } from "../actions/member-experience"
import { Banner } from "@/features/storefront/modules/common/ui"

interface MemberProfile {
  id: string
  name: string
  email: string
  phone: string | null
  dateOfBirth: string | null
  joinDate: string
  status: string
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  healthNotes: { conditions: string[]; injuries: string[]; notes: string } | null
  profilePhotoUrl: string | null
  membershipTier: { id: string; name: string; monthlyPrice: number } | null
  membershipLengthDays: number
  attendanceRate: number
  lastCheckIn: string | null
  updatedAt: string | null
}

interface ProfileFormData {
  name: string
  email: string
  phone: string
  dateOfBirth: string
  emergencyContactName: string
  emergencyContactPhone: string
  healthConditions: string
  healthInjuries: string
  healthNotes: string
}

export default function MemberProfilePage() {
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, dirtyFields } } = useForm<ProfileFormData>()

  const fetchProfile = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const member = await getMemberProfileAction()
      setProfile(member)
      reset({
        name: member.name || "",
        email: member.email || "",
        phone: member.phone || "",
        dateOfBirth: member.dateOfBirth ? member.dateOfBirth.split("T")[0] : "",
        emergencyContactName: member.emergencyContactName || "",
        emergencyContactPhone: member.emergencyContactPhone || "",
        healthConditions: member.healthNotes?.conditions?.join(", ") || "",
        healthInjuries: member.healthNotes?.injuries?.join(", ") || "",
        healthNotes: member.healthNotes?.notes || "",
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [reset])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const onSubmit = async (formData: ProfileFormData) => {
    setIsSaving(true)
    setSaveMessage("")
    try {
      const result = await updateMemberProfileAction({
        expectedUpdatedAt: profile?.updatedAt ?? null,
        ...(dirtyFields.name ? { name: formData.name } : {}),
        ...(dirtyFields.phone ? { phone: formData.phone } : {}),
        ...(dirtyFields.dateOfBirth ? { dateOfBirth: formData.dateOfBirth } : {}),
        ...(dirtyFields.emergencyContactName ? { emergencyContactName: formData.emergencyContactName } : {}),
        ...(dirtyFields.emergencyContactPhone ? { emergencyContactPhone: formData.emergencyContactPhone } : {}),
        ...(dirtyFields.healthConditions || dirtyFields.healthInjuries || dirtyFields.healthNotes ? { healthNotes: {
          conditions: formData.healthConditions.split(",").map(s => s.trim()).filter(Boolean),
          injuries: formData.healthInjuries.split(",").map(s => s.trim()).filter(Boolean),
          notes: formData.healthNotes,
        } } : {}),
      })
      if (!result.success) throw new Error(result.error)

      toast.success("Profile updated successfully")
      setSaveMessage("Your profile has been updated.")
      setIsEditing(false)
      fetchProfile()
    } catch (err: any) {
      toast.error(err.message)
      setSaveMessage(err.message || "Your changes could not be saved. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="sf-page" role="status" aria-label="Loading member details">
        <div className="sf-wrap sf-stack" style={{ maxWidth: "calc(880px + 2 * var(--sf-gutter))" }}>
          <div className="sf-skel" style={{ height: 40, width: 240 }} />
          <div className="sf-skel" style={{ height: 120 }} />
          <div className="sf-skel" style={{ height: 260 }} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="sf-wrap">
        <div className="sf-outcome">
          <h1 className="sf-h2">Member details couldn’t load</h1>
          <Banner tone="bad">{error}</Banner>
          <div className="sf-actions"><button type="button" className="sf-btn" onClick={fetchProfile}>Try again</button><Link href="/account" className="sf-btn" data-variant="secondary">Account</Link></div>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }
  const statusTone = profile.status === "active" ? "ok" : profile.status === "suspended" ? "low" : "bad"
  const readValue = (value: ReactNode) => <p className="sf-strong" style={{ fontWeight: 500 }}>{value}</p>

  return (
    <div className="sf-page">
      <div className="sf-wrap sf-stack" data-gap="lg" style={{ maxWidth: "calc(880px + 2 * var(--sf-gutter))" }}>
        <div>
          <Link href="/account/profile" className="sf-crumb"><ArrowLeft aria-hidden="true" />Profile</Link>
          <div className="sf-row" data-between>
            <h1 className="sf-h1">Member details</h1>
            {!isEditing ? (
              <button type="button" onClick={() => setIsEditing(true)} className="sf-btn" data-variant="secondary">
                <Pencil aria-hidden="true" />
                Edit
              </button>
            ) : (
              <div className="sf-actions">
                <button type="button" disabled={isSaving} onClick={() => { setIsEditing(false); fetchProfile() }} className="sf-btn" data-variant="secondary">
                  Cancel
                </button>
                <button type="button" onClick={handleSubmit(onSubmit)} disabled={isSaving} className="sf-btn">
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
        {saveMessage ? <Banner tone={saveMessage === "Your profile has been updated." ? "ok" : "bad"}>{saveMessage}</Banner> : null}

        <form onSubmit={handleSubmit(onSubmit)} className="sf-stack" data-gap="lg">
          <section className="sf-card" aria-label="Member">
            <div className="sf-row">
              {profile.profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.profilePhotoUrl} alt={profile.name} style={{ width: 64, height: 64, borderRadius: 999, objectFit: "cover" }} />
              ) : (
                <span className="sf-avatar" style={{ width: 64, height: 64, fontSize: "1.25rem" }} aria-hidden="true">{getInitials(profile.name)}</span>
              )}
              <div className="sf-stack" data-gap="sm" style={{ gap: 2 }}>
                <div className="sf-titleline">
                  <h2 className="sf-h3">{profile.name}</h2>
                  <span className="sf-state" data-tone={statusTone} style={{ textTransform: "capitalize" }}>{profile.status}</span>
                </div>
                {profile.membershipTier ? <p className="sf-meta">{profile.membershipTier.name}</p> : null}
              </div>
            </div>
            <dl className="sf-facts" data-plain>
              <div><dt>Member since</dt><dd>{new Date(profile.joinDate).toLocaleDateString()}</dd></div>
              <div><dt>Membership length</dt><dd className="sf-num">{profile.membershipLengthDays} days</dd></div>
              <div><dt>Attendance</dt><dd className="sf-num">{profile.attendanceRate}%</dd></div>
              <div><dt>Last check-in</dt><dd>{profile.lastCheckIn ? new Date(profile.lastCheckIn).toLocaleDateString() : "Never"}</dd></div>
              <div><dt>Plan</dt><dd>{profile.membershipTier?.name || "No active membership"}</dd></div>
            </dl>
            {profile.membershipTier ? <div><Link href="/account/membership" className="sf-link" data-size="sm">Membership<ArrowUpRight aria-hidden="true" /></Link></div> : null}
          </section>

          <section className="sf-card" aria-labelledby="personal-info">
            <h2 id="personal-info" className="sf-h3">Personal</h2>
            <div className="sf-form-row">
              <div className="sf-field">
                <label htmlFor="profile-name">Full name</label>
                {isEditing ? <input id="profile-name" {...register("name", { required: "Name is required" })} aria-invalid={errors.name ? true : undefined} /> : readValue(profile.name)}
                {errors.name ? <p className="sf-field-error" role="alert">{errors.name.message}</p> : null}
              </div>
              <div className="sf-field">
                <span>Email</span>
                {readValue(profile.email)}
                <small>Change it in Profile</small>
              </div>
              <div className="sf-field">
                <label htmlFor="profile-phone">Phone</label>
                {isEditing ? <input id="profile-phone" {...register("phone")} type="tel" /> : readValue(profile.phone || "Not provided")}
              </div>
              <div className="sf-field">
                <label htmlFor="profile-dateOfBirth">Date of birth</label>
                {isEditing ? <input id="profile-dateOfBirth" {...register("dateOfBirth")} type="date" /> : readValue(profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : "Not provided")}
              </div>
            </div>
          </section>

          <section className="sf-card" aria-labelledby="emergency-contact">
            <h2 id="emergency-contact" className="sf-h3">Emergency contact</h2>
            <div className="sf-form-row">
              <div className="sf-field">
                <label htmlFor="profile-emergencyContactName">Name</label>
                {isEditing ? <input id="profile-emergencyContactName" {...register("emergencyContactName")} /> : readValue(profile.emergencyContactName || "Not provided")}
              </div>
              <div className="sf-field">
                <label htmlFor="profile-emergencyContactPhone">Phone</label>
                {isEditing ? <input id="profile-emergencyContactPhone" {...register("emergencyContactPhone")} type="tel" /> : readValue(profile.emergencyContactPhone || "Not provided")}
              </div>
            </div>
          </section>

          <section className="sf-card" aria-labelledby="health-info">
            <div className="sf-row" data-between>
              <h2 id="health-info" className="sf-h3">Health (optional)</h2>
              <Link href="/account/participation" className="sf-link" data-size="sm">Consent and privacy<ArrowUpRight aria-hidden="true" /></Link>
            </div>
            <div className="sf-form-row">
              <div className="sf-field">
                <label htmlFor="profile-healthConditions">Conditions (comma-separated)</label>
                {isEditing ? <input id="profile-healthConditions" {...register("healthConditions")} /> : readValue(profile.healthNotes?.conditions?.length ? profile.healthNotes.conditions.join(", ") : "None listed")}
              </div>
              <div className="sf-field">
                <label htmlFor="profile-healthInjuries">Injuries (comma-separated)</label>
                {isEditing ? <input id="profile-healthInjuries" {...register("healthInjuries")} /> : readValue(profile.healthNotes?.injuries?.length ? profile.healthNotes.injuries.join(", ") : "None listed")}
              </div>
            </div>
            <div className="sf-field">
              <label htmlFor="profile-healthNotes">Notes</label>
              {isEditing ? <textarea id="profile-healthNotes" {...register("healthNotes")} rows={3} /> : readValue(profile.healthNotes?.notes || "None")}
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}
