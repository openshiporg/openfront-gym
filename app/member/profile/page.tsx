"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { User, Phone, Mail, Calendar, Shield, Heart, Camera, Save, X, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

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
  profilePhoto: { url: string } | null
  membershipTier: { id: string; name: string; monthlyPrice: number } | null
  membershipLengthDays: number
  attendanceRate: number
  lastCheckIn: string | null
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
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormData>()

  const fetchProfile = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/member/profile")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch profile")
      }

      setProfile(data.member)
      reset({
        name: data.member.name || "",
        email: data.member.email || "",
        phone: data.member.phone || "",
        dateOfBirth: data.member.dateOfBirth ? data.member.dateOfBirth.split("T")[0] : "",
        emergencyContactName: data.member.emergencyContactName || "",
        emergencyContactPhone: data.member.emergencyContactPhone || "",
        healthConditions: data.member.healthNotes?.conditions?.join(", ") || "",
        healthInjuries: data.member.healthNotes?.injuries?.join(", ") || "",
        healthNotes: data.member.healthNotes?.notes || "",
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
    try {
      const response = await fetch("/api/member/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth || null,
          emergencyContactName: formData.emergencyContactName,
          emergencyContactPhone: formData.emergencyContactPhone,
          healthNotes: {
            conditions: formData.healthConditions.split(",").map(s => s.trim()).filter(Boolean),
            injuries: formData.healthInjuries.split(",").map(s => s.trim()).filter(Boolean),
            notes: formData.healthNotes,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile")
      }

      toast.success("Profile updated successfully")
      setIsEditing(false)
      fetchProfile()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("photo", file)

    try {
      const response = await fetch("/api/member/profile/photo", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to upload photo")
      }

      toast.success("Photo updated successfully")
      fetchProfile()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchProfile}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profile) return null

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Profile</h1>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => { setIsEditing(false); fetchProfile() }} variant="outline" className="gap-2">
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button onClick={handleSubmit(onSubmit)} disabled={isSaving} className="gap-2">
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile.profilePhoto?.url} alt={profile.name} />
                    <AvatarFallback className="text-2xl">{getInitials(profile.name)}</AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <label className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90">
                      <Camera className="w-4 h-4" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload}
                      />
                    </label>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-semibold">{profile.name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      profile.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                      profile.status === "suspended" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                      "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }`}>
                      {profile.status}
                    </span>
                  </div>
                  {profile.membershipTier && (
                    <p className="text-muted-foreground">
                      {profile.membershipTier.name} Member
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span>Member for {profile.membershipLengthDays} days</span>
                    <span>|</span>
                    <span>{profile.attendanceRate}% attendance rate</span>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                  {isEditing ? (
                    <Input
                      {...register("name", { required: "Name is required" })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="mt-1">{profile.name}</p>
                  )}
                  {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </label>
                  <p className="mt-1">{profile.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Contact support to change email</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </label>
                  {isEditing ? (
                    <Input
                      {...register("phone")}
                      type="tel"
                      className="mt-1"
                      placeholder="(555) 123-4567"
                    />
                  ) : (
                    <p className="mt-1">{profile.phone || "Not provided"}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date of Birth
                  </label>
                  {isEditing ? (
                    <Input
                      {...register("dateOfBirth")}
                      type="date"
                      className="mt-1"
                    />
                  ) : (
                    <p className="mt-1">
                      {profile.dateOfBirth
                        ? new Date(profile.dateOfBirth).toLocaleDateString()
                        : "Not provided"}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Emergency Contact
                </CardTitle>
                <CardDescription>
                  Who should we contact in case of emergency?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Contact Name</label>
                  {isEditing ? (
                    <Input
                      {...register("emergencyContactName")}
                      className="mt-1"
                      placeholder="Jane Doe"
                    />
                  ) : (
                    <p className="mt-1">{profile.emergencyContactName || "Not provided"}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Contact Phone</label>
                  {isEditing ? (
                    <Input
                      {...register("emergencyContactPhone")}
                      type="tel"
                      className="mt-1"
                      placeholder="(555) 123-4567"
                    />
                  ) : (
                    <p className="mt-1">{profile.emergencyContactPhone || "Not provided"}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="w-5 h-5" />
                Health Information
              </CardTitle>
              <CardDescription>
                Help us provide better service by sharing relevant health information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Medical Conditions (comma-separated)
                </label>
                {isEditing ? (
                  <Input
                    {...register("healthConditions")}
                    className="mt-1"
                    placeholder="e.g., Asthma, Diabetes"
                  />
                ) : (
                  <p className="mt-1">
                    {profile.healthNotes?.conditions?.length
                      ? profile.healthNotes.conditions.join(", ")
                      : "None listed"}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Current Injuries (comma-separated)
                </label>
                {isEditing ? (
                  <Input
                    {...register("healthInjuries")}
                    className="mt-1"
                    placeholder="e.g., Lower back pain, Knee injury"
                  />
                ) : (
                  <p className="mt-1">
                    {profile.healthNotes?.injuries?.length
                      ? profile.healthNotes.injuries.join(", ")
                      : "None listed"}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Additional Notes
                </label>
                {isEditing ? (
                  <Textarea
                    {...register("healthNotes")}
                    className="mt-1"
                    rows={3}
                    placeholder="Any other health information trainers should know..."
                  />
                ) : (
                  <p className="mt-1">
                    {profile.healthNotes?.notes || "None"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Membership Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Current Plan</label>
                  <p className="mt-1 font-medium">
                    {profile.membershipTier?.name || "No active membership"}
                  </p>
                  {profile.membershipTier && (
                    <p className="text-sm text-muted-foreground">
                      ${profile.membershipTier.monthlyPrice}/month
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                  <p className="mt-1">{new Date(profile.joinDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Check-in</label>
                  <p className="mt-1">
                    {profile.lastCheckIn
                      ? new Date(profile.lastCheckIn).toLocaleDateString()
                      : "Never"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
