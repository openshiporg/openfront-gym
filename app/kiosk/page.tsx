"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Member {
  id: string;
  name: string;
  email: string;
  membership: {
    id: string;
    status: string;
    tier: {
      name: string;
    };
    classCreditsRemaining: number;
  } | null;
}

interface CheckInResult {
  success: boolean;
  message: string;
  member?: Member;
  attendanceId?: string;
}

export default function CheckInKiosk() {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [mode, setMode] = useState<"pin" | "search">("pin");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-focus PIN input
  useEffect(() => {
    if (mode === "pin" && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [mode, result]);

  // Clear result after 5 seconds
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        setResult(null);
        setPin("");
        setSearchTerm("");
        setSearchResults([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const handlePinInput = (digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
    }
  };

  const handleClear = () => {
    setPin("");
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleCheckIn = async (memberId?: string) => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            mutation KioskCheckIn($memberId: String, $pin: String) {
              kioskCheckIn(memberId: $memberId, pin: $pin) {
                success
                message
                member {
                  id
                  name
                  email
                  membership {
                    id
                    status
                    tier {
                      name
                    }
                    classCreditsRemaining
                  }
                }
                attendanceId
              }
            }
          `,
          variables: memberId ? { memberId } : { pin },
        }),
      });

      const data = await response.json();

      if (data.errors) {
        setResult({
          success: false,
          message: data.errors[0].message || "Check-in failed",
        });
      } else if (data.data?.kioskCheckIn) {
        setResult(data.data.kioskCheckIn);
      } else {
        setResult({
          success: false,
          message: "Unable to complete check-in",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: "Network error. Please try again.",
      });
    } finally {
      setIsLoading(false);
      setPin("");
    }
  };

  const handleSearch = async () => {
    if (searchTerm.length < 2) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query SearchMembers($search: String!) {
              users(where: {
                OR: [
                  { name: { contains: $search, mode: insensitive } },
                  { email: { contains: $search, mode: insensitive } }
                ]
              }, take: 5) {
                id
                name
                email
                membership {
                  id
                  status
                  tier {
                    name
                  }
                  classCreditsRemaining
                }
              }
            }
          `,
          variables: { search: searchTerm },
        }),
      });

      const data = await response.json();
      if (data.data?.users) {
        setSearchResults(data.data.users);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Openfront Gym</h1>
            <p className="text-sm text-gray-400">Member Check-In</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-mono">{formatTime(currentTime)}</p>
            <p className="text-sm text-gray-400">{formatDate(currentTime)}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {/* Result Display */}
        {result && (
          <Alert
            className={`mb-6 ${
              result.success
                ? "bg-green-900/50 border-green-600 text-green-100"
                : "bg-red-900/50 border-red-600 text-red-100"
            }`}
          >
            <AlertDescription className="text-lg">
              {result.success ? (
                <div className="space-y-2">
                  <p className="text-2xl font-bold">Welcome, {result.member?.name}!</p>
                  <p>{result.message}</p>
                  {result.member?.membership && (
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary">
                        {result.member.membership.tier.name} Member
                      </Badge>
                      <Badge variant="outline">
                        {result.member.membership.classCreditsRemaining === -1
                          ? "Unlimited Classes"
                          : `${result.member.membership.classCreditsRemaining} Credits`}
                      </Badge>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xl">{result.message}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === "pin" ? "default" : "outline"}
            onClick={() => {
              setMode("pin");
              setSearchTerm("");
              setSearchResults([]);
            }}
            className="flex-1"
          >
            PIN Entry
          </Button>
          <Button
            variant={mode === "search" ? "default" : "outline"}
            onClick={() => {
              setMode("search");
              setPin("");
            }}
            className="flex-1"
          >
            Name Search
          </Button>
        </div>

        {mode === "pin" ? (
          /* PIN Entry Mode */
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-center text-white">Enter Your PIN</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* PIN Display */}
              <div className="flex justify-center gap-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-12 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold ${
                      i < pin.length
                        ? "border-blue-500 bg-blue-500/20"
                        : "border-gray-600"
                    }`}
                  >
                    {i < pin.length ? "●" : ""}
                  </div>
                ))}
              </div>

              {/* Hidden input for physical keyboard */}
              <input
                ref={pinInputRef}
                type="password"
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pin.length >= 4) {
                    handleCheckIn();
                  }
                }}
                className="sr-only"
                autoFocus
              />

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <Button
                    key={num}
                    variant="outline"
                    size="lg"
                    onClick={() => handlePinInput(num.toString())}
                    className="h-16 text-2xl font-bold bg-gray-700 hover:bg-gray-600 border-gray-600"
                  >
                    {num}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleClear}
                  className="h-16 text-sm font-bold bg-gray-700 hover:bg-gray-600 border-gray-600"
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => handlePinInput("0")}
                  className="h-16 text-2xl font-bold bg-gray-700 hover:bg-gray-600 border-gray-600"
                >
                  0
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleBackspace}
                  className="h-16 text-sm font-bold bg-gray-700 hover:bg-gray-600 border-gray-600"
                >
                  Back
                </Button>
              </div>

              {/* Check In Button */}
              <Button
                onClick={() => handleCheckIn()}
                disabled={pin.length < 4 || isLoading}
                className="w-full h-14 text-xl font-bold bg-green-600 hover:bg-green-700"
              >
                {isLoading ? "Checking In..." : "Check In"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Name Search Mode */
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-center text-white">Search by Name or Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  className="flex-1 h-12 text-lg bg-gray-700 border-gray-600"
                />
                <Button
                  onClick={handleSearch}
                  disabled={searchTerm.length < 2 || isLoading}
                  className="h-12 px-6"
                >
                  Search
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Select a member:</p>
                  {searchResults.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleCheckIn(member.id)}
                      disabled={isLoading}
                      className="w-full p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold">{member.name}</p>
                        <p className="text-sm text-gray-400">{member.email}</p>
                      </div>
                      {member.membership ? (
                        <Badge
                          variant={
                            member.membership.status === "active"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {member.membership.tier.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline">No Membership</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchTerm.length >= 2 && !isLoading && (
                <p className="text-center text-gray-400">
                  No members found. Try a different search.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 p-4">
        <p className="text-center text-sm text-gray-400">
          Need help? Ask a staff member or call the front desk.
        </p>
      </footer>
    </div>
  );
}
