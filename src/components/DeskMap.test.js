import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeskMap, { DESK_POSITIONS } from './DeskMap';

// Conference rooms share the floor plan with desks, and the two are labelled
// differently on purpose. These tests hold that line: a desk keeps the wording
// it already had, and a room is never announced by the desk number it carries
// internally to keep the existing routes working.

const desk = (over = {}) => ({
  id: '4', number: 4, label: 'Desk# 4', shortLabel: '4',
  status: 'available', ...over,
});
const room = (over = {}) => ({
  id: '19', number: 14, label: 'Conference Room 511B', shortLabel: '511B',
  resourceType: 'room', capacity: 8, status: 'available', ...over,
});

describe('the marker shows a token, not a sentence', () => {
  // The map is a diagram. "Desk# 4" repeated twelve times across a floor plan
  // is a paragraph; "4" is a label.
  it('shows a desk as its bare number', () => {
    render(<DeskMap desks={[desk()]} />);
    const marker = screen.getByLabelText('Desk 4, available');
    expect(marker).toHaveTextContent(/^4$/);
  });

  it('shows a room as its short name', () => {
    render(<DeskMap desks={[room()]} />);
    const marker = screen.getByLabelText('Conference Room 511B, available');
    expect(marker).toHaveTextContent(/^511B$/);
  });

  // The full names belong on pages, not on the plan.
  it('puts no full name on the map', () => {
    render(<DeskMap desks={[desk(), room()]} />);
    expect(screen.queryByText(/Desk# 4/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conference Room/)).not.toBeInTheDocument();
  });

  // A room's desk_number exists to keep the old routes working; showing 14 on
  // the plan beside a desk numbered 12 would read as a thirteenth desk.
  it('never shows a room its desk number', () => {
    render(<DeskMap desks={[room()]} />);
    expect(screen.queryByText('14')).not.toBeInTheDocument();
  });

  it('falls back to the number when shortLabel is missing', () => {
    render(<DeskMap desks={[desk({ shortLabel: undefined })]} />);
    expect(screen.getByLabelText('Desk 4, available')).toHaveTextContent(/^4$/);
  });
});

describe('accessible names', () => {
  // "Desk# 4" would be read aloud as "desk number sign four".
  it('announces a desk without the hash from its label', () => {
    render(<DeskMap desks={[desk()]} />);
    expect(screen.getByLabelText('Desk 4, available')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Desk# 4/)).not.toBeInTheDocument();
  });

  it('announces a room by name', () => {
    render(<DeskMap desks={[room()]} />);
    expect(screen.getByLabelText('Conference Room 511B, available')).toBeInTheDocument();
  });

  // 13 and 14 exist so desk_number can stay NOT NULL UNIQUE and every existing
  // route keeps working. Nobody reads that number off a door.
  it('never announces a room by its internal desk number', () => {
    render(<DeskMap desks={[room()]} />);
    expect(screen.queryByLabelText(/Desk 14/)).not.toBeInTheDocument();
  });

  it('still spells out live statuses for a room', () => {
    render(<DeskMap desks={[room({ status: 'in_use' })]} />);
    expect(screen.getByLabelText('Conference Room 511B, in use')).toBeInTheDocument();
  });
});

describe('what may be picked', () => {
  it('lets anything be picked by default', async () => {
    const onSelect = jest.fn();
    render(<DeskMap desks={[room()]} onSelect={onSelect} />);
    await userEvent.click(screen.getByLabelText(/Conference Room 511B/));
    expect(onSelect).toHaveBeenCalled();
  });

  // The kiosk and the visitor path both need rooms visible but not choosable.
  it('shows an unselectable resource rather than hiding it', () => {
    render(<DeskMap desks={[desk(), room()]} canSelect={(d) => d.resourceType !== 'room'} />);
    expect(screen.getByLabelText(/Conference Room 511B/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Conference Room 511B/)).toBeDisabled();
    expect(screen.getByLabelText('Desk 4, available')).toBeEnabled();
  });

  it('does not report a click on something it will not allow', async () => {
    const onSelect = jest.fn();
    render(
      <DeskMap desks={[room()]} onSelect={onSelect} canSelect={() => false} />
    );
    await userEvent.click(screen.getByLabelText(/Conference Room 511B/));
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Greying something out without saying why is the failure this avoids.
  it('carries the reason into the accessible name', () => {
    render(
      <DeskMap
        desks={[room()]}
        canSelect={() => false}
        unselectableHint={() => 'Rooms are for staff.'}
      />
    );
    expect(screen.getByLabelText(/Rooms are for staff\./)).toBeInTheDocument();
  });
});

describe('placement', () => {
  it('gives both conference rooms a position, or they render nowhere', () => {
    expect(DESK_POSITIONS[13]).toBeDefined();
    expect(DESK_POSITIONS[14]).toBeDefined();
  });

  // The rooms sit in opposite corners of the plan; if these ever converge,
  // somebody has copied a position rather than measured one.
  it('does not stack the two rooms on the same spot', () => {
    expect(DESK_POSITIONS[13]).not.toEqual(DESK_POSITIONS[14]);
  });

  it('leaves the twelve desk positions alone', () => {
    expect(Object.keys(DESK_POSITIONS).filter((n) => Number(n) <= 12)).toHaveLength(12);
    expect(DESK_POSITIONS[1]).toEqual({ left: '23.9%', top: '22%' });
    expect(DESK_POSITIONS[12]).toEqual({ left: '71%', top: '75%' });
  });

  // A resource with no entry renders nothing at all, which is silent — worth a
  // test so an unmapped room is a failing assertion rather than an empty map.
  it('renders nothing for a resource with no position', () => {
    render(<DeskMap desks={[room({ number: 99, label: 'Unmapped Room' })]} />);
    expect(screen.queryByLabelText(/Unmapped Room/)).not.toBeInTheDocument();
  });
});
