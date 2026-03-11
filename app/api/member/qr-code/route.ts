import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { generateQRCodeDataURL } from "@/lib/qrcode"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("keystonejs-session")

    if (!sessionCookie?.value) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    const graphqlEndpoint = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3007"

    const response = await fetch(`${graphqlEndpoint}/api/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `keystonejs-session=${sessionCookie.value}`,
      },
      body: JSON.stringify({
        query: `
          query GetCurrentMember {
            authenticatedItem {
              ... on User {
                id
                member {
                  id
                  status
                }
              }
            }
          }
        `,
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.error("GraphQL errors:", result.errors)
      return NextResponse.json(
        { error: "Failed to get member info" },
        { status: 500 }
      )
    }

    const member = result.data?.authenticatedItem?.member
    if (!member) {
      return NextResponse.json(
        { error: "No member profile found" },
        { status: 404 }
      )
    }

    if (member.status !== "active") {
      return NextResponse.json(
        { error: `Your membership is ${member.status}. Please contact support.` },
        { status: 403 }
      )
    }

    const qrDataUrl = await generateQRCodeDataURL(member.id)

    return NextResponse.json({
      qrDataUrl,
      memberId: member.id,
      expiresIn: 30,
    })
  } catch (error) {
    console.error("QR code generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    )
  }
}
