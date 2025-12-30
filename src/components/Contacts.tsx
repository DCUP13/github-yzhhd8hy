import React, { useState, useEffect } from 'react';
import { Users, Search, Building2, Mail, Phone, MapPin, Home, ChevronRight, X, Award, User, Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Contact {
  id: string;
  name: string;
  email: string;
  screen_name: string;
  phone: string;
  phone_cell: string;
  phone_brokerage: string;
  phone_business: string;
  business_name: string;
  profile_url: string;
  is_team_lead: boolean;
  status: string;
  created_at: string;
}

interface Listing {
  id: string;
  zpid: number;
  home_type: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  price_currency: string;
  status: string;
  brokerage_name: string;
  listing_url: string;
  primary_photo_url: string;
  living_area_value: number;
  living_area_units: string;
}

interface ContactsProps {
  onSignOut: () => void;
  currentView: string;
}

export function Contacts({ onSignOut, currentView }: ContactsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactListings, setContactListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.bulk-actions-dropdown')) {
        setShowBulkActions(false);
      }
    };

    if (showBulkActions) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showBulkActions]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.error('No user found');
        return;
      }

      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContactListings = async (contactId: string) => {
    try {
      setLoadingListings(true);
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setContactListings(data || []);
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoadingListings(false);
    }
  };

  const handleContactClick = async (contact: Contact) => {
    setSelectedContact(contact);
    await fetchContactListings(contact.id);
  };

  const handleCloseDetails = () => {
    setSelectedContact(null);
    setContactListings([]);
  };

  const handleDeleteContact = async (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!window.confirm('Are you sure you want to delete this contact? This will also delete all associated listings.')) {
      return;
    }

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      setContacts(contacts.filter(c => c.id !== contactId));

      if (selectedContact?.id === contactId) {
        setSelectedContact(null);
        setContactListings([]);
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Failed to delete contact. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`Are you sure you want to delete all ${contacts.length} contacts? This action cannot be undone and will also delete all associated listings.`)) {
      return;
    }

    if (!window.confirm('This is your final warning. This will permanently delete ALL contacts. Are you absolutely sure?')) {
      return;
    }

    try {
      setDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setContacts([]);
      setSelectedContact(null);
      setContactListings([]);
      setShowBulkActions(false);
      alert('All contacts have been deleted successfully.');
    } catch (error) {
      console.error('Error deleting all contacts:', error);
      alert('Failed to delete all contacts. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.business_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const teamLeads = filteredContacts.filter(contact => contact.is_team_lead);
  const teamMembers = filteredContacts.filter(contact => !contact.is_team_lead);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scraped Contacts</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {contacts.length} total contacts
            </div>
            {contacts.length > 0 && (
              <div className="relative bulk-actions-dropdown">
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  disabled={deleting}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Bulk Actions
                  <ChevronDown className="w-4 h-4 ml-2" />
                </button>
                {showBulkActions && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1">
                      <button
                        onClick={handleDeleteAll}
                        disabled={deleting}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete All Contacts
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or business..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {teamLeads.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-600" />
                  Team Leads ({teamLeads.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamLeads.map((contact) => (
                    <div
                      key={contact.id}
                      onClick={() => handleContactClick(contact)}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer relative group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                            {contact.name || 'Unknown'}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {contact.business_name || 'No business'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleDeleteContact(contact.id, e)}
                            disabled={deleting}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        {contact.email && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {contact.email}
                          </p>
                        )}
                        {(contact.phone || contact.phone_cell) && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {contact.phone_cell || contact.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {teamMembers.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-gray-600" />
                  Team Members ({teamMembers.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamMembers.map((contact) => (
                    <div
                      key={contact.id}
                      onClick={() => handleContactClick(contact)}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer relative group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                            {contact.name || 'Unknown'}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {contact.business_name || 'No business'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleDeleteContact(contact.id, e)}
                            disabled={deleting}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        {contact.email && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {contact.email}
                          </p>
                        )}
                        {(contact.phone || contact.phone_cell) && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {contact.phone_cell || contact.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredContacts.length === 0 && !loading && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No contacts found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedContact.is_team_lead && (
                  <Award className="w-6 h-6 text-yellow-600" />
                )}
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedContact.name}
                </h2>
              </div>
              <button
                onClick={handleCloseDetails}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              >
                <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-gray-400 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Business Name</p>
                      <p className="text-gray-900 dark:text-white">{selectedContact.business_name || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-gray-400 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                      <a
                        href={`mailto:${selectedContact.email}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {selectedContact.email || 'N/A'}
                      </a>
                    </div>
                  </div>
                  {selectedContact.phone_cell && (
                    <div className="flex items-start gap-3">
                      <Phone className="w-5 h-5 text-gray-400 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cell Phone</p>
                        <a
                          href={`tel:${selectedContact.phone_cell}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {selectedContact.phone_cell}
                        </a>
                      </div>
                    </div>
                  )}
                  {selectedContact.phone_brokerage && (
                    <div className="flex items-start gap-3">
                      <Phone className="w-5 h-5 text-gray-400 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Brokerage Phone</p>
                        <a
                          href={`tel:${selectedContact.phone_brokerage}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {selectedContact.phone_brokerage}
                        </a>
                      </div>
                    </div>
                  )}
                  {selectedContact.phone_business && (
                    <div className="flex items-start gap-3">
                      <Phone className="w-5 h-5 text-gray-400 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Business Phone</p>
                        <a
                          href={`tel:${selectedContact.phone_business}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {selectedContact.phone_business}
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-gray-400 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Role</p>
                      <p className="text-gray-900 dark:text-white">
                        {selectedContact.is_team_lead ? 'Team Lead' : 'Team Member'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  Listings ({contactListings.length})
                </h3>
                {loadingListings ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : contactListings.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contactListings.map((listing) => (
                      <div key={listing.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        {listing.primary_photo_url && (
                          <img
                            src={listing.primary_photo_url}
                            alt={listing.address_line1}
                            className="w-full h-40 object-cover rounded-lg mb-3"
                          />
                        )}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {formatPrice(listing.price)}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {listing.address_line1}, {listing.city}, {listing.state} {listing.postal_code}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <span>{listing.bedrooms} bed</span>
                            <span>{listing.bathrooms} bath</span>
                            {listing.living_area_value && (
                              <span>{listing.living_area_value.toLocaleString()} {listing.living_area_units}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                            {listing.home_type} • {listing.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Home className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 dark:text-gray-400">No listings found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
