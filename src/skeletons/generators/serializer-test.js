import {
  describeModule,
  it
  } from 'ember-mocha';

describeModule(
  'serializer:__DASHERIZE_NAMESPACE__',
  '__NAMESPACE__',
  {
    // Specify the other units that are required for this test.
    // needs: ['serializer:foo']
  },
  function () {
    // Replace this with your real tests.
    it('exists', function () {
      var serializer = this.subject();
      serializer.should.be.ok;
    });
  }
);
